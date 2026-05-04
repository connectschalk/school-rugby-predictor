import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildStructuredWarningsFromStrings, type SyncWarningItem } from '@/lib/sync-master-warnings'
import { splitCsvLine } from '@/lib/parse-game-matches-bulk'
import {
  collectGroupLinkResolutionWarnings,
  computeFixtureGroupLinkIds,
  effectiveGroupFieldsForMatchRow,
  loadFixtureGroupMaps,
  replaceMatchFixtureGroupLinks,
  type FixtureGroupLinkInput,
  type GroupLinkBudget,
  type FixtureGroupMaps,
  type GroupLinkWarningEffective,
  type SheetClassificationForWarnings,
} from '@/lib/fixture-group-resolve'
import {
  buildTeamsRegistryDebug,
  parseTeamsSheetCsv,
  SheetTeamsRegistry,
  teamLookupNormalize,
  type TeamsRegistryDebug,
  type TeamsRegistryUnresolvedTeam,
} from '@/lib/sheet-teams-registry'
import { relinkAllCompletedMatchesToFixtureGroups } from '@/lib/repair-missing-fixture-group-links'
import { scoreCompletedPredictionMatches } from '@/lib/score-completed-unscored-matches'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'
import type { TeamRow } from '@/lib/team-name-match'

export const runtime = 'nodejs'

/** Raw row from the Fixtures tab CSV (Teams + Fixtures are the only source of truth). */
type FixtureCsvRow = {
  date: string
  time: string
  home_team: string
  away_team: string
  home_score: string
  away_score: string
  league_group: string
  is_prestige: string
  status: string
  verification_status: string
  source: string
}

type SyncSummary = {
  mode: 'dry_run' | 'run'
  replace_upcoming: boolean
  incoming_rows: number
  would_insert_upcoming: number
  would_update_upcoming: number
  would_reactivate_upcoming: number
  would_reject_old_upcoming: number
  would_insert_completed: number
  would_update_completed: number
  /** Same as would_insert_completed — completed sheet rows → new game_matches */
  would_insert_completed_game_matches: number
  /** Same as would_update_completed — completed sheet rows → update existing game_matches */
  would_update_completed_game_matches: number
  inserted_upcoming: number
  updated_upcoming: number
  reactivated_upcoming: number
  rejected_old_upcoming: number
  inserted_completed: number
  updated_completed: number
  skipped_duplicates: number
  province_group_warnings: number
  would_link_groups: number
  linked_groups: number
  group_link_warnings: number
  /** Completed game_matches rows for which scoring RPC ran successfully during sheet row processing */
  completed_matches_scored?: number
  /** Post-sync sweep: completed + predictions + no scores — RPC successes (see `scoreCompletedPredictionMatches`) */
  post_sync_sweep_scored?: number
  post_sync_sweep_attempted?: number
  /** Completed matches processed in post-sync relink pass (`relinkAllCompletedMatchesToFixtureGroups`) */
  group_link_repair_examined?: number
  /** Completed matches where a `game_match_groups` row was inserted after clear+resolve */
  group_link_repair_linked?: number
  validation_errors: string[]
  warnings: SyncWarningItem[]
  /** Present on dry-run (preview) responses and stored on preview `sync_runs.summary`. */
  teams_registry_debug?: TeamsRegistryDebug
}

function normalizeHeader(v: string): string {
  return v
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/** Redact spreadsheet id in Google Sheets CSV URLs for safe preview logging. */
function maskTeamsCsvUrl(url: string): string {
  const t = url.trim()
  if (!t) return '(empty)'
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{6,})\//)
  if (m?.[1]) {
    const id = m[1]
    const masked = id.length <= 10 ? `${id.slice(0, 2)}…` : `${id.slice(0, 4)}…${id.slice(-4)}`
    return t.replace(id, masked)
  }
  return t.length > 120 ? `${t.slice(0, 55)}…${t.slice(-40)}` : t
}

/**
 * Resolve `public.teams.id` for a Teams-tab canonical name: match by trim+lowercase, else insert `name` as given.
 * Used for completed `matches` rows (game_matches already store canonical text from the sheet registry).
 */
async function ensureTeamIdForCanonical(
  supabase: SupabaseClient,
  canonicalName: string,
  cache: Map<string, number>,
  teams: TeamRow[]
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const key = teamLookupNormalize(canonicalName)
  if (!key) return { ok: false, message: 'empty canonical name' }
  const cached = cache.get(key)
  if (cached !== undefined) return { ok: true, id: cached }

  for (const t of teams) {
    if (teamLookupNormalize(t.name) === key) {
      cache.set(key, t.id)
      return { ok: true, id: t.id }
    }
  }

  const name = canonicalName.trim()
  const { data: inserted, error: insErr } = await supabase.from('teams').insert({ name }).select('id').single()
  if (!insErr && inserted && inserted.id != null) {
    const id = Number(inserted.id)
    if (Number.isFinite(id)) {
      teams.push({ id, name })
      cache.set(key, id)
      return { ok: true, id }
    }
  }

  const { data: row, error: selErr } = await supabase.from('teams').select('id, name').eq('name', name).maybeSingle()
  if (!selErr && row?.id != null) {
    const id = Number(row.id)
    if (Number.isFinite(id)) {
      cache.set(key, id)
      if (!teams.some((t) => t.id === id)) teams.push({ id, name: row.name ?? name })
      return { ok: true, id }
    }
  }

  const { data: scan, error: scanErr } = await supabase.from('teams').select('id, name')
  if (!scanErr && scan?.length) {
    const hit = scan.find((r) => teamLookupNormalize(String(r.name ?? '')) === key)
    if (hit?.id != null) {
      const id = Number(hit.id)
      if (Number.isFinite(id)) {
        cache.set(key, id)
        if (!teams.some((t) => t.id === id)) teams.push({ id, name: String(hit.name ?? name) })
        return { ok: true, id }
      }
    }
  }

  return {
    ok: false,
    message: insErr?.message ?? selErr?.message ?? scanErr?.message ?? 'could not resolve or create team',
  }
}

function parseBool(v: string): boolean {
  const x = v.trim().toLowerCase()
  return x === 'true' || x === '1' || x === 'yes' || x === 'y'
}

function normalizeDate(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

function normalizeTime(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) return `${String(Number(hm[1])).padStart(2, '0')}:${hm[2]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`
}

function toSastKickoffIso(dateYmd: string, hhmm: string): string {
  return `${dateYmd}T${hhmm}:00+02:00`
}

function normalizeGameMatchStatus(v: string): 'upcoming' | 'locked' | 'completed' | 'cancelled' {
  const s = v.trim().toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'locked') return 'locked'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'upcoming'
}

function shouldPersistInterprovincial(homeProvince: string, awayProvince: string): boolean {
  const h = homeProvince.trim().toLowerCase()
  const a = awayProvince.trim().toLowerCase()
  if (!h || !a) return false
  return h !== a
}

type NormalizedSheetRow = {
  kickoff_time: string
  match_date: string
  /** Stored on `game_matches` — canonical_name from Teams tab. */
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  league_group: string
  home_team_province: string
  away_team_province: string
  is_interprovincial: boolean
  has_wp_elite_team: boolean
  home_is_prestige_team: boolean
  away_is_prestige_team: boolean
  home_is_wp_elite: boolean
  away_is_wp_elite: boolean
  /** Fixtures `is_prestige` cell when present; null if column missing. */
  is_prestige_sheet: boolean | null
  is_prestige_effective: boolean
  status: 'upcoming' | 'completed'
  verification_status: 'draft' | 'needs_review' | 'verified' | 'rejected'
  source: string
  dedupe_key: string
}

function buildLinkContext(row: NormalizedSheetRow) {
  const eff = effectiveGroupFieldsForMatchRow(row.league_group, '', '', false)
  const linkInput: FixtureGroupLinkInput = {
    leagueForDb: eff.leagueForDb,
    legacyProvinceGroupForDb: eff.legacyProvinceGroupForDb,
    tournamentForDb: eff.tournamentForDb,
    homeTeamProvince: row.home_team_province || null,
    awayTeamProvince: row.away_team_province || null,
    linkPrestigePool: row.is_prestige_effective,
    linkInterprovincialPool: row.is_interprovincial,
    linkWpElitePool: row.has_wp_elite_team,
  }
  const warnEff: GroupLinkWarningEffective = {
    leagueForDb: eff.leagueForDb,
    legacyProvinceGroupForDb: eff.legacyProvinceGroupForDb,
    tournamentForDb: eff.tournamentForDb,
    linkPrestigePool: row.is_prestige_effective,
    linkInterprovincialPool: row.is_interprovincial,
    linkWpElitePool: row.has_wp_elite_team,
  }
  const sheetWarn: SheetClassificationForWarnings = {
    league: row.league_group,
    legacyProvince: '',
    tournament: '',
    homeTeamProvince: row.home_team_province,
    awayTeamProvince: row.away_team_province,
    isPrestigeMatchExplicit: row.is_prestige_sheet,
  }
  return { eff, linkInput, warnEff, sheetWarn }
}

function normalizeVerification(v: string): 'draft' | 'needs_review' | 'verified' | 'rejected' {
  const s = v.trim().toLowerCase()
  if (s === 'draft' || s === 'needs_review' || s === 'verified' || s === 'rejected') return s
  return 'verified'
}

function toNumOrNull(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function orderedPairKey(a: string, b: string): string {
  return [a.trim().toLowerCase(), b.trim().toLowerCase()].sort().join('|')
}

const PROVINCE_ALIAS_TO_CANONICAL: Record<string, string> = {
  wp: 'Western Province',
  ep: 'Eastern Province',
  kzn: 'KwaZulu-Natal',
  fs: 'Free State',
  gp: 'Gauteng',
  bul: 'Blue Bulls',
  val: 'Valke',
  leo: 'Lions',
  lim: 'Limpopo',
  pum: 'Pumas',
  bor: 'Border',
  bl: 'Boland',
  swd: 'South Western Districts',
}

function canonicalProvinceGroup(raw: string): { value: string | null; warning?: string } {
  const t = raw.trim()
  if (!t) return { value: null }
  const key = t.toLowerCase()
  if (PROVINCE_ALIAS_TO_CANONICAL[key]) return { value: PROVINCE_ALIAS_TO_CANONICAL[key] }
  const canonicalValues = new Set(Object.values(PROVINCE_ALIAS_TO_CANONICAL).map((v) => v.toLowerCase()))
  if (canonicalValues.has(key)) return { value: t }
  // Keep sheet text so `game_matches.province_group` is populated and pool linking / DB trigger can resolve it.
  return { value: t }
}

function dateInSastFromIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)
}

function parseFixturesSheetCsv(csvText: string): { rows: FixtureCsvRow[]; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], errors: ['Fixtures CSV is empty'] }

  const header = splitCsvLine(lines[0]).map(normalizeHeader)
  const firstIdx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const idx = {
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    home_team: header.indexOf('home_team'),
    away_team: header.indexOf('away_team'),
    home_score: header.indexOf('home_score'),
    away_score: header.indexOf('away_score'),
    league_group: firstIdx(['league_group', 'league']),
    is_prestige: firstIdx(['is_prestige', 'prestige']),
    status: header.indexOf('status'),
    verification_status: header.indexOf('verification_status'),
    source: header.indexOf('source'),
  }
  if (idx.date < 0 || idx.time < 0 || idx.home_team < 0 || idx.away_team < 0) {
    return {
      rows: [],
      errors: ['Fixtures CSV requires headers: date, time, home_team, away_team'],
    }
  }

  const rows: FixtureCsvRow[] = []
  const errors: string[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i])
    const read = (k: keyof typeof idx) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '')
    rows.push({
      date: read('date'),
      time: read('time'),
      home_team: read('home_team'),
      away_team: read('away_team'),
      home_score: read('home_score'),
      away_score: read('away_score'),
      league_group: read('league_group'),
      is_prestige: idx.is_prestige >= 0 ? read('is_prestige') : '',
      status: read('status'),
      verification_status: read('verification_status'),
      source: read('source'),
    })
  }
  return { rows, errors }
}

export async function POST(request: Request) {
  const reqUrl = new URL(request.url)
  const dryRun = reqUrl.searchParams.get('dry_run') === '1'
  const replaceUpcoming = reqUrl.searchParams.get('replace_upcoming') === '1'

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const fixturesCsvUrl = process.env.GOOGLE_SHEET_FIXTURES_CSV_URL ?? ''
  const teamsCsvUrl = process.env.GOOGLE_SHEET_TEAMS_CSV_URL ?? ''
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured for sheet sync' }, { status: 500 })
  }
  if (!fixturesCsvUrl) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_SHEET_FIXTURES_CSV_URL is required (Fixtures tab CSV export only — Master tab is not used)' },
      { status: 500 }
    )
  }
  if (!teamsCsvUrl) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_SHEET_TEAMS_CSV_URL is required (Teams tab export)' },
      { status: 500 }
    )
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabase, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const errors: string[] = []
  let skipped_duplicates = 0
  let inserted_upcoming = 0
  let updated_upcoming = 0
  let reactivated_upcoming = 0
  let rejected_old_upcoming = 0
  let inserted_completed = 0
  let updated_completed = 0
  let would_insert_upcoming = 0
  let would_update_upcoming = 0
  let would_reactivate_upcoming = 0
  let would_reject_old_upcoming = 0
  let would_insert_completed = 0
  let would_update_completed = 0
  let province_group_warnings = 0
  let would_link_groups = 0
  let linked_groups = 0
  let group_link_warnings = 0
  let completed_matches_scored = 0
  let post_sync_sweep_scored = 0
  let post_sync_sweep_attempted = 0
  let group_link_repair_examined = 0
  let group_link_repair_linked = 0

  const [teamsCsvRes, fixturesCsvRes] = await Promise.all([fetch(teamsCsvUrl), fetch(fixturesCsvUrl)])
  if (!teamsCsvRes.ok) {
    return NextResponse.json({ ok: false, error: `Could not fetch Teams CSV (${teamsCsvRes.status})` }, { status: 400 })
  }
  if (!fixturesCsvRes.ok) {
    return NextResponse.json(
      { ok: false, error: `Could not fetch Fixtures CSV (${fixturesCsvRes.status})` },
      { status: 400 }
    )
  }
  const teamsCsvText = await teamsCsvRes.text()
  const fixturesCsvText = await fixturesCsvRes.text()
  const teamsParsed = parseTeamsSheetCsv(teamsCsvText)
  errors.push(...teamsParsed.errors)
  const teamRegistry = new SheetTeamsRegistry(teamsParsed.rows)
  let teamsRegistryDebug: TeamsRegistryDebug | undefined
  const unresolvedTeamsDebug: TeamsRegistryUnresolvedTeam[] = []
  const parsed = parseFixturesSheetCsv(fixturesCsvText)
  errors.push(...parsed.errors)
  if (!parsed.rows.length) {
    teamsRegistryDebug = dryRun
      ? buildTeamsRegistryDebug(teamRegistry, {
          teamsRowsCount: teamsParsed.rows.length,
          teamsCsvUrlUsedMasked: maskTeamsCsvUrl(teamsCsvUrl),
          firstFiveCanonicalNames: teamsParsed.rows
            .slice(0, 5)
            .map((r) => (r.canonical_name || r.team_name).trim()),
          unresolvedTeams: [],
        })
      : undefined
    const validation_errors = errors.length ? errors : ['No rows found in CSV']
    const emptySummary: SyncSummary = {
      mode: dryRun ? 'dry_run' : 'run',
      replace_upcoming: replaceUpcoming,
      incoming_rows: 0,
      would_insert_upcoming: 0,
      would_update_upcoming: 0,
      would_reactivate_upcoming: 0,
      would_reject_old_upcoming: 0,
      would_insert_completed: 0,
      would_update_completed: 0,
      would_insert_completed_game_matches: 0,
      would_update_completed_game_matches: 0,
      inserted_upcoming: 0,
      updated_upcoming: 0,
      reactivated_upcoming: 0,
      rejected_old_upcoming: 0,
      inserted_completed: 0,
      updated_completed: 0,
      skipped_duplicates: 0,
      province_group_warnings: 0,
      would_link_groups: 0,
      linked_groups: 0,
      group_link_warnings: 0,
      completed_matches_scored: 0,
      post_sync_sweep_scored: 0,
      post_sync_sweep_attempted: 0,
      group_link_repair_examined: 0,
      group_link_repair_linked: 0,
      validation_errors,
      warnings: buildStructuredWarningsFromStrings(validation_errors),
      ...(teamsRegistryDebug ? { teams_registry_debug: teamsRegistryDebug } : {}),
    }
    await supabase.from('sync_runs').insert({
      mode: dryRun ? 'dry_run' : 'run',
      replace_upcoming: replaceUpcoming,
      incoming_rows: 0,
      inserted_upcoming: 0,
      updated_upcoming: 0,
      reactivated_upcoming: 0,
      rejected_old_upcoming: 0,
      inserted_completed: 0,
      updated_completed: 0,
      skipped_duplicates: 0,
      province_group_warnings: 0,
      would_link_groups: 0,
      linked_groups: 0,
      group_link_warnings: 0,
      validation_errors: emptySummary.validation_errors,
      summary: emptySummary,
    })
    return NextResponse.json({ ok: false, ...emptySummary })
  }

  const normalized: NormalizedSheetRow[] = []

  const seen = new Set<string>()
  const pairKeyCounts = new Map<string, number>()
  const teamDayCounts = new Map<string, number>()
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const r = parsed.rows[i]
    const date = normalizeDate(r.date)
    const timeNorm = normalizeTime(r.time)
    const rawHome = r.home_team.trim()
    const rawAway = r.away_team.trim()
    if (!date) {
      errors.push(`Row ${i + 2}: missing or invalid date`)
      continue
    }
    if (!timeNorm) {
      errors.push(`Row ${i + 2}: missing or invalid time`)
      continue
    }
    if (!rawHome || !rawAway) {
      errors.push(`Row ${i + 2}: missing home_team or away_team`)
      continue
    }
    const hr = teamRegistry.resolve(rawHome)
    const ar = teamRegistry.resolve(rawAway)
    if (dryRun && !hr.ok) {
      unresolvedTeamsDebug.push({
        fixture_sheet_row: i + 2,
        side: 'home',
        raw_team_value: rawHome,
        normalized_team_key: teamLookupNormalize(rawHome),
        similar_lookup_keys: teamRegistry.findSimilarLookupKeys(rawHome, 10),
      })
    }
    if (dryRun && !ar.ok) {
      unresolvedTeamsDebug.push({
        fixture_sheet_row: i + 2,
        side: 'away',
        raw_team_value: rawAway,
        normalized_team_key: teamLookupNormalize(rawAway),
        similar_lookup_keys: teamRegistry.findSimilarLookupKeys(rawAway, 10),
      })
    }
    if (!hr.ok) {
      const nk = teamLookupNormalize(rawHome)
      const similar = teamRegistry.findSimilarLookupKeys(rawHome, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched home_team raw=${JSON.stringify(rawHome)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }
    if (!ar.ok) {
      const nk = teamLookupNormalize(rawAway)
      const similar = teamRegistry.findSimilarLookupKeys(rawAway, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched away_team raw=${JSON.stringify(rawAway)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }

    const pairCountKey = `${date}|${
      hr.ok && ar.ok
        ? orderedPairKey(hr.team.canonicalName.trim(), ar.team.canonicalName.trim())
        : orderedPairKey(rawHome, rawAway)
    }`
    pairKeyCounts.set(pairCountKey, (pairKeyCounts.get(pairCountKey) ?? 0) + 1)

    if (!hr.ok || !ar.ok) {
      continue
    }

    const home = hr.team.canonicalName.trim()
    const away = ar.team.canonicalName.trim()
    if (home.toLowerCase() === away.toLowerCase()) {
      errors.push(`Row ${i + 2}: home and away resolve to the same canonical team`)
      continue
    }

    const dedupe = `${date}|${orderedPairKey(home, away)}`
    if (seen.has(dedupe)) {
      skipped_duplicates += 1
      continue
    }
    seen.add(dedupe)

    const hpRaw = (hr.team.province ?? '').trim()
    const apRaw = (ar.team.province ?? '').trim()
    const homeProv = canonicalProvinceGroup(hpRaw)
    const awayProv = canonicalProvinceGroup(apRaw)
    if (homeProv.warning) {
      province_group_warnings += 1
      errors.push(`Warning row ${i + 2} home province: ${homeProv.warning}`)
    }
    if (awayProv.warning) {
      province_group_warnings += 1
      errors.push(`Warning row ${i + 2} away province: ${awayProv.warning}`)
    }

    const hs = toNumOrNull(r.home_score)
    const as = toNumOrNull(r.away_score)
    const hasBothScores = hs != null && as != null
    const status: 'upcoming' | 'completed' = hasBothScores ? 'completed' : 'upcoming'
    const sheetStatus = normalizeGameMatchStatus(r.status)
    if (hasBothScores && sheetStatus !== 'completed') {
      errors.push(
        `Warning row ${i + 2}: both scores present — status forced to completed (sheet had "${r.status.trim()}")`
      )
    }
    if (!hasBothScores && sheetStatus === 'completed') {
      errors.push(
        `Warning row ${i + 2}: sheet status completed but scores incomplete — using upcoming`
      )
    }

    const isPrestigeSheet: boolean | null = r.is_prestige.trim() === '' ? null : parseBool(r.is_prestige)
    const homePrestigeT = hr.team.isPrestigeTeam
    const awayPrestigeT = ar.team.isPrestigeTeam
    const isPrestigeEffective = (isPrestigeSheet === true) || homePrestigeT || awayPrestigeT
    const homeWp = hr.team.isWpElite
    const awayWp = ar.team.isWpElite
    const hp = homeProv.value ?? ''
    const ap = awayProv.value ?? ''
    const inter = shouldPersistInterprovincial(hp, ap)

    normalized.push({
      kickoff_time: toSastKickoffIso(date, timeNorm),
      match_date: date,
      home_team: home,
      away_team: away,
      home_score: hs,
      away_score: as,
      league_group: r.league_group.trim(),
      home_team_province: hp,
      away_team_province: ap,
      is_interprovincial: inter,
      has_wp_elite_team: homeWp || awayWp,
      home_is_prestige_team: homePrestigeT,
      away_is_prestige_team: awayPrestigeT,
      home_is_wp_elite: homeWp,
      away_is_wp_elite: awayWp,
      is_prestige_sheet: isPrestigeSheet,
      is_prestige_effective: isPrestigeEffective,
      status,
      verification_status: normalizeVerification(r.verification_status),
      source: r.source.trim(),
      dedupe_key: dedupe,
    })

    const homeDay = `${date}|${home.toLowerCase()}`
    const awayDay = `${date}|${away.toLowerCase()}`
    teamDayCounts.set(homeDay, (teamDayCounts.get(homeDay) ?? 0) + 1)
    teamDayCounts.set(awayDay, (teamDayCounts.get(awayDay) ?? 0) + 1)
  }

  teamsRegistryDebug = dryRun
    ? buildTeamsRegistryDebug(teamRegistry, {
        teamsRowsCount: teamsParsed.rows.length,
        teamsCsvUrlUsedMasked: maskTeamsCsvUrl(teamsCsvUrl),
        firstFiveCanonicalNames: teamsParsed.rows
          .slice(0, 5)
          .map((r) => (r.canonical_name || r.team_name).trim()),
        unresolvedTeams: unresolvedTeamsDebug,
        completedUsedRegistryCanonical: normalized.some((r) => r.status === 'completed'),
      })
    : undefined

  for (const [pair, count] of pairKeyCounts.entries()) {
    if (count > 1) {
      errors.push(
        `Warning: duplicate fixture — same calendar date and same two teams (home/away order ignored): ${pair}`
      )
    }
  }
  for (const [teamDate, count] of teamDayCounts.entries()) {
    if (count > 1) errors.push(`Warning: same team appears multiple times on same date (${teamDate})`)
  }

  const sheetCompletedPairKeys = new Set(
    normalized
      .filter((r) => r.status === 'completed')
      .map((r) => `${r.match_date}|${orderedPairKey(r.home_team, r.away_team)}`)
  )

  const { data: teamsData, error: teamsErr } = await supabase.from('teams').select('id, name')
  if (teamsErr) {
    return NextResponse.json({ ok: false, error: `Could not load teams for completed rows: ${teamsErr.message}` }, { status: 500 })
  }
  const teams = (teamsData as TeamRow[] | null) ?? []

  let fixtureGroupMaps: FixtureGroupMaps = await loadFixtureGroupMaps(supabase)

  /** All statuses (incl. rejected/locked/cancelled/draft) — unique pair + SAST calendar day identifies one row */
  const { data: existingGameMatchesData, error: existingGameMatchesErr } = await supabase
    .from('game_matches')
    .select('id, kickoff_time, home_team, away_team, status, verification_status, admin_notes')
  if (existingGameMatchesErr) {
    return NextResponse.json({ ok: false, error: `Could not load existing game matches: ${existingGameMatchesErr.message}` }, { status: 500 })
  }

  type ExistingGm = {
    id: string
    kickoff_time: string
    home_team: string
    away_team: string
    status: string
    verification_status: string | null
    admin_notes: string | null
  }

  /** Key: SAST date (YYYY-MM-DD) | unordered normalized home/away pair */
  const existingGameMatchByPairOnDate = new Map<string, ExistingGm>()
  const existingCurrentUpcomingIdsByKey = new Map<string, string>()
  for (const row of
    ((existingGameMatchesData as
      | {
          id: string
          kickoff_time: string
          home_team: string
          away_team: string
          status: string
          verification_status: string | null
          admin_notes: string | null
        }[]
      | null) ?? [])) {
    const key = `${dateInSastFromIso(row.kickoff_time)}|${orderedPairKey(row.home_team, row.away_team)}`
    existingGameMatchByPairOnDate.set(key, {
      id: row.id,
      kickoff_time: row.kickoff_time,
      home_team: row.home_team,
      away_team: row.away_team,
      status: row.status,
      verification_status: row.verification_status,
      admin_notes: row.admin_notes,
    })
    if (row.status === 'upcoming') {
      existingCurrentUpcomingIdsByKey.set(key, row.id)
    }
  }

  /** Replace-mode baseline: upcoming rows present before this sync (do not mutate during run). */
  const snapshotUpcomingKeyToId = new Map(existingCurrentUpcomingIdsByKey)

  const completedDates = [...new Set(normalized.filter((r) => r.status === 'completed').map((r) => r.match_date))]
  const existingMatchesByDate = new Map<string, Array<{ id: number; team_a_id: number; team_b_id: number }>>()
  if (completedDates.length > 0) {
    const { data: existingMatchesRes } = await supabase
      .from('matches')
      .select('id, match_date, team_a_id, team_b_id')
      .in('match_date', completedDates)
    for (const row of
      ((existingMatchesRes as { id: number; match_date: string; team_a_id: number; team_b_id: number }[] | null) ??
        [])) {
      if (!existingMatchesByDate.has(row.match_date)) existingMatchesByDate.set(row.match_date, [])
      existingMatchesByDate.get(row.match_date)?.push({ id: row.id, team_a_id: row.team_a_id, team_b_id: row.team_b_id })
    }
  }

  // Compute dry-run counts first.
  const sheetUpcomingKeys = new Set<string>()
  for (const row of normalized) {
    const pairOnDate = `${row.match_date}|${orderedPairKey(row.home_team, row.away_team)}`
    if (row.status === 'upcoming') {
      sheetUpcomingKeys.add(pairOnDate)
      const { linkInput, warnEff, sheetWarn } = buildLinkContext(row)
      const linkIds = computeFixtureGroupLinkIds(fixtureGroupMaps, linkInput)
      if (linkIds.length > 0) would_link_groups += 1
      const rowLabel = `${row.home_team} vs ${row.away_team}`
      const rowWarns = collectGroupLinkResolutionWarnings(fixtureGroupMaps, warnEff, sheetWarn, rowLabel)
      group_link_warnings += rowWarns.messages.length
      for (const w of rowWarns.messages) errors.push(w)
      const existingGm = existingGameMatchByPairOnDate.get(pairOnDate)
      if (existingGm) {
        if (existingGm.status === 'rejected' || existingGm.verification_status === 'rejected') {
          would_reactivate_upcoming += 1
        } else {
          would_update_upcoming += 1
        }
      } else {
        would_insert_upcoming += 1
      }
      continue
    }

    if (row.status !== 'completed') {
      continue
    }

    if (teamLookupNormalize(row.home_team) === teamLookupNormalize(row.away_team)) {
      errors.push(`Completed row has same home and away canonical team (${row.home_team})`)
      continue
    }
    if (row.home_score == null || row.away_score == null) {
      errors.push(`Completed row missing score (${row.home_team} vs ${row.away_team})`)
      continue
    }
    const existingGmForCompleted = existingGameMatchByPairOnDate.get(pairOnDate)
    if (existingGmForCompleted) would_update_completed += 1
    else would_insert_completed += 1
  }

  if (replaceUpcoming) {
    for (const key of snapshotUpcomingKeyToId.keys()) {
      if (sheetUpcomingKeys.has(key)) continue
      if (sheetCompletedPairKeys.has(key)) continue
      would_reject_old_upcoming += 1
    }
  }

  let groupLinkBudget: GroupLinkBudget | undefined
  let groupLinkAborted = false

  if (!dryRun) {
  groupLinkBudget = { failures: 0, maxFailures: 20 }
  fixtureGroupMaps = await loadFixtureGroupMaps(supabase)

  const completedTeamIdCache = new Map<string, number>()
  for (const t of teams) {
    completedTeamIdCache.set(teamLookupNormalize(t.name), t.id)
  }

  let upcomingUpsertFailed = false
  /** Each successful upcoming or completed `game_matches` insert/update is followed by `replaceMatchFixtureGroupLinks`. */
  for (const row of normalized) {
    const pairOnDate = `${row.match_date}|${orderedPairKey(row.home_team, row.away_team)}`
    if (row.status === 'upcoming') {
      const { eff, linkInput, warnEff, sheetWarn } = buildLinkContext(row)
      const upLeague = eff.leagueForDb ?? ''
      const upHomeTeamProv = row.home_team_province.trim()
      const upAwayTeamProv = row.away_team_province.trim()
      const rowLabelUp = `${row.home_team} vs ${row.away_team}`
      const warnUp = collectGroupLinkResolutionWarnings(fixtureGroupMaps, warnEff, sheetWarn, rowLabelUp)
      group_link_warnings += warnUp.messages.length
      for (const w of warnUp.messages) errors.push(w)
      const existingGmUp = existingGameMatchByPairOnDate.get(pairOnDate)
      let touchedMatchId: string | null = null
      if (existingGmUp?.id) {
        const { error } = await supabase
          .from('game_matches')
          .update({
            kickoff_time: row.kickoff_time,
            home_team: row.home_team,
            away_team: row.away_team,
            province_group: null,
            league_group: upLeague ? upLeague : null,
            tournament: null,
            home_team_province: upHomeTeamProv ? upHomeTeamProv : null,
            away_team_province: upAwayTeamProv ? upAwayTeamProv : null,
            is_interprovincial: row.is_interprovincial,
            has_wp_elite_team: row.has_wp_elite_team,
            home_is_prestige_team: row.home_is_prestige_team,
            away_is_prestige_team: row.away_is_prestige_team,
            home_is_wp_elite: row.home_is_wp_elite,
            away_is_wp_elite: row.away_is_wp_elite,
            is_prestige_match: row.is_prestige_sheet,
            is_prestige: !!row.is_prestige_effective,
            status: row.status,
            verification_status: 'verified',
            source_name: row.source || 'Google Sheet (Teams + Fixtures)',
            source_url: fixturesCsvUrl,
            source_type: 'google_sheet_teams_fixtures',
            rejected_reason: null,
          })
          .eq('id', existingGmUp.id)
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`Upcoming game_matches update failed (${row.home_team} vs ${row.away_team}): ${error.message}`)
        } else {
          existingGameMatchByPairOnDate.set(pairOnDate, {
            ...existingGmUp,
            kickoff_time: row.kickoff_time,
            home_team: row.home_team,
            away_team: row.away_team,
            status: 'upcoming',
            verification_status: 'verified',
          })
          if (existingGmUp.status === 'rejected' || existingGmUp.verification_status === 'rejected') {
            reactivated_upcoming += 1
          } else {
            updated_upcoming += 1
          }
          touchedMatchId = existingGmUp.id
        }
      } else {
        const { data: insertedRow, error } = await supabase.from('game_matches').insert({
          home_team: row.home_team,
          away_team: row.away_team,
          kickoff_time: row.kickoff_time,
          status: row.status,
          verification_status: 'verified',
          province_group: null,
          league_group: upLeague ? upLeague : null,
          tournament: null,
          home_team_province: upHomeTeamProv ? upHomeTeamProv : null,
          away_team_province: upAwayTeamProv ? upAwayTeamProv : null,
          is_interprovincial: row.is_interprovincial,
          has_wp_elite_team: row.has_wp_elite_team,
          home_is_prestige_team: row.home_is_prestige_team,
          away_is_prestige_team: row.away_is_prestige_team,
          home_is_wp_elite: row.home_is_wp_elite,
          away_is_wp_elite: row.away_is_wp_elite,
          is_prestige_match: row.is_prestige_sheet,
          is_prestige: !!row.is_prestige_effective,
          source_name: row.source || 'Google Sheet (Teams + Fixtures)',
          source_url: fixturesCsvUrl,
          source_type: 'google_sheet_teams_fixtures',
        }).select('id').single()
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`Upcoming game_matches insert failed (${row.home_team} vs ${row.away_team}): ${error.message}`)
        } else {
          inserted_upcoming += 1
          const newId = String(insertedRow?.id ?? '')
          touchedMatchId = newId
          if (newId) {
            existingGameMatchByPairOnDate.set(pairOnDate, {
              id: newId,
              kickoff_time: row.kickoff_time,
              home_team: row.home_team,
              away_team: row.away_team,
              status: 'upcoming',
              verification_status: 'verified',
              admin_notes: null,
            })
            existingCurrentUpcomingIdsByKey.set(pairOnDate, newId)
          }
        }
      }

      if (touchedMatchId) {
        const linkIdsUp = computeFixtureGroupLinkIds(fixtureGroupMaps, linkInput)
        const gl = await replaceMatchFixtureGroupLinks(
          supabase,
          touchedMatchId,
          linkIdsUp,
          rowLabelUp,
          errors,
          {
            budget: groupLinkBudget,
            matchTeams: { home: row.home_team, away: row.away_team },
          }
        )
        linked_groups += gl.linked_groups
        group_link_warnings += gl.group_link_warnings
        if (gl.aborted) {
          groupLinkAborted = true
          errors.push(
            'Stopped fixture group linking after 20 database failures (remaining sheet rows were not processed).'
          )
          break
        }
      }
      continue
    }

    if (row.status !== 'completed') {
      continue
    }

    // completed — `row.home_team` / `row.away_team` are Teams-tab canonical names (not DB alias resolution).
    const homeIdRes = await ensureTeamIdForCanonical(supabase, row.home_team, completedTeamIdCache, teams)
    const awayIdRes = await ensureTeamIdForCanonical(supabase, row.away_team, completedTeamIdCache, teams)
    if (!homeIdRes.ok || !awayIdRes.ok) {
      const detail = !homeIdRes.ok ? homeIdRes.message : !awayIdRes.ok ? awayIdRes.message : 'unknown'
      errors.push(`Completed row team id ensure failed (${row.home_team} vs ${row.away_team}): ${detail}`)
      continue
    }
    const homeTeamId = homeIdRes.id
    const awayTeamId = awayIdRes.id
    if (homeTeamId === awayTeamId) {
      errors.push(`Completed row resolved to same team id (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (row.home_score == null || row.away_score == null) {
      errors.push(`Completed row missing score (${row.home_team} vs ${row.away_team})`)
      continue
    }

    const { eff, linkInput, warnEff, sheetWarn } = buildLinkContext(row)
    const dbLeague = eff.leagueForDb
    const dbHomeTeamProv = row.home_team_province.trim()
    const dbAwayTeamProv = row.away_team_province.trim()

    const existingForDate = existingMatchesByDate.get(row.match_date) ?? []
    const duplicateMatch = existingForDate.find((m) => {
      const a = m.team_a_id
      const b = m.team_b_id
      return (
        (a === homeTeamId && b === awayTeamId) ||
        (a === awayTeamId && b === homeTeamId)
      )
    })
    if (duplicateMatch) {
      const { error: matchesUpdateErr } = await supabase
        .from('matches')
        .update({
          team_a_score: row.home_score,
          team_b_score: row.away_score,
          season: Number(row.match_date.slice(0, 4)),
        })
        .eq('id', duplicateMatch.id)
      if (matchesUpdateErr) {
        errors.push(`Completed update in matches failed (${row.home_team} vs ${row.away_team}): ${matchesUpdateErr.message}`)
      }
    } else {
      const { data: insertedMatch, error: matchInsertErr } = await supabase
        .from('matches')
        .insert({
          team_a_id: homeTeamId,
          team_b_id: awayTeamId,
          team_a_score: row.home_score,
          team_b_score: row.away_score,
          match_date: row.match_date,
          season: Number(row.match_date.slice(0, 4)),
        })
        .select('id, team_a_id, team_b_id, match_date')
        .single()
      if (matchInsertErr) {
        errors.push(`Completed insert into matches failed (${row.home_team} vs ${row.away_team}): ${matchInsertErr.message}`)
      } else if (insertedMatch) {
        if (!existingMatchesByDate.has(row.match_date)) existingMatchesByDate.set(row.match_date, [])
        existingMatchesByDate.get(row.match_date)?.push({
          id: insertedMatch.id as number,
          team_a_id: insertedMatch.team_a_id as number,
          team_b_id: insertedMatch.team_b_id as number,
        })
      }
    }

    const existingGmCompleted = existingGameMatchByPairOnDate.get(pairOnDate) ?? null

    let completedGmTouchedId: string | null = null

    if (existingGmCompleted) {
      const { error: gmUpdateErr } = await supabase
        .from('game_matches')
        .update({
          kickoff_time: row.kickoff_time,
          home_team: row.home_team,
          away_team: row.away_team,
          status: 'completed',
          home_score: row.home_score,
          away_score: row.away_score,
          verification_status: 'verified',
          province_group: null,
          league_group: dbLeague,
          tournament: null,
          home_team_province: dbHomeTeamProv ? dbHomeTeamProv : null,
          away_team_province: dbAwayTeamProv ? dbAwayTeamProv : null,
          is_interprovincial: row.is_interprovincial,
          has_wp_elite_team: row.has_wp_elite_team,
          home_is_prestige_team: row.home_is_prestige_team,
          away_is_prestige_team: row.away_is_prestige_team,
          home_is_wp_elite: row.home_is_wp_elite,
          away_is_wp_elite: row.away_is_wp_elite,
          is_prestige_match: row.is_prestige_sheet,
          is_prestige: !!row.is_prestige_effective,
          rejected_reason: null,
          source_name: row.source || 'Google Sheet (Teams + Fixtures)',
          source_url: fixturesCsvUrl,
          source_type: 'google_sheet_teams_fixtures',
        })
        .eq('id', existingGmCompleted.id)
      if (gmUpdateErr) {
        errors.push(`Completed game_matches update failed (${row.home_team} vs ${row.away_team}): ${gmUpdateErr.message}`)
      } else {
        updated_completed += 1
        existingGameMatchByPairOnDate.set(pairOnDate, {
          ...existingGmCompleted,
          kickoff_time: row.kickoff_time,
          home_team: row.home_team,
          away_team: row.away_team,
          status: 'completed',
          verification_status: 'verified',
        })
        existingCurrentUpcomingIdsByKey.delete(pairOnDate)
        completedGmTouchedId = existingGmCompleted.id
      }
    } else {
      const { data: insertedGm, error: gmInsertErr } = await supabase
        .from('game_matches')
        .insert({
          home_team: row.home_team,
          away_team: row.away_team,
          kickoff_time: row.kickoff_time,
          status: 'completed',
          home_score: row.home_score,
          away_score: row.away_score,
          verification_status: 'verified',
          province_group: null,
          league_group: dbLeague,
          tournament: null,
          home_team_province: dbHomeTeamProv ? dbHomeTeamProv : null,
          away_team_province: dbAwayTeamProv ? dbAwayTeamProv : null,
          is_interprovincial: row.is_interprovincial,
          has_wp_elite_team: row.has_wp_elite_team,
          home_is_prestige_team: row.home_is_prestige_team,
          away_is_prestige_team: row.away_is_prestige_team,
          home_is_wp_elite: row.home_is_wp_elite,
          away_is_wp_elite: row.away_is_wp_elite,
          is_prestige_match: row.is_prestige_sheet,
          is_prestige: !!row.is_prestige_effective,
          rejected_reason: null,
          source_name: row.source || 'Google Sheet (Teams + Fixtures)',
          source_url: fixturesCsvUrl,
          source_type: 'google_sheet_teams_fixtures',
        })
        .select('id')
        .single()
      if (gmInsertErr) {
        errors.push(`Completed game_matches insert failed (${row.home_team} vs ${row.away_team}): ${gmInsertErr.message}`)
      } else {
        inserted_completed += 1
        const newGmId = String(insertedGm?.id ?? '')
        if (newGmId) {
          existingGameMatchByPairOnDate.set(pairOnDate, {
            id: newGmId,
            kickoff_time: row.kickoff_time,
            home_team: row.home_team,
            away_team: row.away_team,
            status: 'completed',
            verification_status: 'verified',
            admin_notes: null,
          })
          completedGmTouchedId = newGmId
        }
        existingCurrentUpcomingIdsByKey.delete(pairOnDate)
      }
    }

    const rowLabelC = `${row.home_team} vs ${row.away_team}`
    const warnC = collectGroupLinkResolutionWarnings(fixtureGroupMaps, warnEff, sheetWarn, rowLabelC)
    group_link_warnings += warnC.messages.length
    for (const w of warnC.messages) errors.push(w)

    const linkIdsCompleted = computeFixtureGroupLinkIds(fixtureGroupMaps, linkInput)

    if (completedGmTouchedId) {
      const gl = await replaceMatchFixtureGroupLinks(
        supabase,
        completedGmTouchedId,
        linkIdsCompleted,
        rowLabelC,
        errors,
        {
          budget: groupLinkBudget,
          matchTeams: { home: row.home_team, away: row.away_team },
        }
      )
      linked_groups += gl.linked_groups
      group_link_warnings += gl.group_link_warnings
      if (gl.aborted) {
        groupLinkAborted = true
        errors.push(
          'Stopped fixture group linking after 20 database failures (remaining sheet rows were not processed).'
        )
        break
      }
      const sc = await rpcScorePredictionsForMatch(supabase, completedGmTouchedId)
      if (sc.error) {
        errors.push(
          `Warning: scoring failed for completed match ${completedGmTouchedId}: ${sc.error.message}`
        )
      } else {
        completed_matches_scored += 1
      }
    }
  }

  if (replaceUpcoming && !upcomingUpsertFailed) {
    const note = 'Replaced by Google Sheet sync (Teams + Fixtures)'
    for (const [key] of snapshotUpcomingKeyToId.entries()) {
      if (sheetUpcomingKeys.has(key)) continue
      if (sheetCompletedPairKeys.has(key)) continue
      const current = existingGameMatchByPairOnDate.get(key)
      if (!current || current.status !== 'upcoming') continue
      const combinedNotes = [current.admin_notes?.trim(), note].filter(Boolean).join(' | ')
      const { error: rejectErr } = await supabase
        .from('game_matches')
        .update({
          verification_status: 'rejected',
          rejected_reason: note,
          admin_notes: combinedNotes || null,
        })
        .eq('id', current.id)
      if (rejectErr) {
        errors.push(`Could not reject existing upcoming fixture ${current.id}: ${rejectErr.message}`)
      } else {
        rejected_old_upcoming += 1
      }
    }
  } else if (replaceUpcoming && upcomingUpsertFailed) {
    errors.push('Replace mode skipped old-upcoming rejection because one or more upcoming upserts failed.')
  }
  }

  if (!dryRun && groupLinkBudget && !groupLinkAborted) {
    try {
      const rep = await relinkAllCompletedMatchesToFixtureGroups(supabase, groupLinkBudget)
      group_link_repair_examined = rep.processed
      group_link_repair_linked = rep.linked
      for (const w of rep.warnings) errors.push(w)
      if (rep.group_link_aborted) {
        groupLinkAborted = true
      }
    } catch (e) {
      errors.push(
        `Warning: completed fixture group relink failed: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  } else if (!dryRun && groupLinkAborted) {
    errors.push('Skipped post-sync completed fixture group repair because group linking was stopped early.')
  }

  if (!dryRun) {
    try {
      const sweep = await scoreCompletedPredictionMatches(supabase, { onlyWithoutScores: true })
      post_sync_sweep_scored = sweep.matchesScoredOk
      post_sync_sweep_attempted = sweep.matchIdsAttempted
      for (const err of sweep.scoringErrors) {
        errors.push(`Warning: post-sync scoring sweep: ${err}`)
      }
    } catch (e) {
      errors.push(
        `Warning: post-sync scoring sweep failed: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  const summary: SyncSummary = {
    mode: dryRun ? 'dry_run' : 'run',
    replace_upcoming: replaceUpcoming,
    incoming_rows: parsed.rows.length,
    would_insert_upcoming,
    would_update_upcoming,
    would_reactivate_upcoming,
    would_reject_old_upcoming,
    would_insert_completed,
    would_update_completed,
    would_insert_completed_game_matches: would_insert_completed,
    would_update_completed_game_matches: would_update_completed,
    inserted_upcoming,
    updated_upcoming,
    reactivated_upcoming,
    rejected_old_upcoming,
    inserted_completed,
    updated_completed,
    skipped_duplicates,
    province_group_warnings,
    would_link_groups,
    linked_groups,
    group_link_warnings,
    completed_matches_scored,
    post_sync_sweep_scored,
    post_sync_sweep_attempted,
    group_link_repair_examined,
    group_link_repair_linked,
    validation_errors: errors,
    warnings: buildStructuredWarningsFromStrings(errors),
    ...(teamsRegistryDebug ? { teams_registry_debug: teamsRegistryDebug } : {}),
  }

  const { error: logErr } = await supabase.from('sync_runs').insert({
    mode: dryRun ? 'dry_run' : 'run',
    replace_upcoming: replaceUpcoming,
    incoming_rows: parsed.rows.length,
    inserted_upcoming,
    updated_upcoming,
    reactivated_upcoming,
    rejected_old_upcoming,
    inserted_completed,
    updated_completed,
    skipped_duplicates,
    province_group_warnings,
    would_link_groups,
    linked_groups,
    group_link_warnings,
    validation_errors: errors,
    summary,
  })
  if (logErr) {
    errors.push(`Sync log insert failed: ${logErr.message}`)
  }

  const warnings = buildStructuredWarningsFromStrings(errors)
  const responseSummary: SyncSummary = {
    ...summary,
    validation_errors: errors,
    warnings,
  }

  return NextResponse.json({
    ok: true,
    ...responseSummary,
  })
}
