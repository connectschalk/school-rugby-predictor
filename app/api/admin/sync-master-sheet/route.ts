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
  normalizeLeagueGroupForGameMatches,
  normalizeProvinceLabelForGameMatches,
  type FixtureGroupLinkInput,
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
import type { TeamRow } from '@/lib/team-name-match'

export const runtime = 'nodejs'

const SYNC_IMPORT_MAX_MS = 45_000
const SYNC_BATCH_SIZE = 50

export const SYNC_IMPORT_FOLLOWUP_NOTICE =
  'Sync imports fixtures only. Run group linking and scoring separately.'

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

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
  /** DB failures while writing `game_match_groups` (delete/insert); capped at budget max during run. */
  group_link_failures?: number
  /** Rows where group linking was skipped because the failure budget was reached. */
  skipped_group_linking_count?: number
  /** New `game_matches` rows inserted this run (upcoming + completed). */
  game_matches_inserted?: number
  /** Existing `game_matches` rows updated this run (upcoming + completed). */
  game_matches_updated?: number
  matches_inserted?: number
  matches_updated?: number
  sync_import_notice?: string
  last_processed_fixture_row?: string
  /** Legacy counters — always 0 (linking/scoring removed from import). */
  completed_matches_scored?: number
  post_sync_sweep_scored?: number
  post_sync_sweep_attempted?: number
  group_link_repair_examined?: number
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
 * Pre-load and batch-create `teams` rows for all canonical names on completed fixtures (no per-row DB calls in sync loop).
 */
async function batchEnsureTeamIdsForCompletedRows(
  supabase: SupabaseClient,
  normalized: NormalizedSheetRow[],
  teams: TeamRow[],
  cache: Map<string, number>,
  errors: string[]
): Promise<void> {
  for (const t of teams) {
    const k = teamLookupNormalize(t.name)
    if (k) cache.set(k, t.id)
  }

  const names = new Set<string>()
  for (const row of normalized) {
    if (row.status !== 'completed') continue
    if (row.home_score == null || row.away_score == null) continue
    if (teamLookupNormalize(row.home_team) === teamLookupNormalize(row.away_team)) continue
    names.add(row.home_team.trim())
    names.add(row.away_team.trim())
  }

  const missingByNorm = new Map<string, string>()
  for (const name of names) {
    const k = teamLookupNormalize(name)
    if (!k) continue
    if (cache.has(k)) continue
    if (!missingByNorm.has(k)) missingByNorm.set(k, name.trim())
  }

  const toCreate = [...missingByNorm.values()]
  for (const part of chunkArray(toCreate, SYNC_BATCH_SIZE)) {
    const { data, error } = await supabase.from('teams').insert(part.map((name) => ({ name }))).select('id, name')
    if (!error && data?.length) {
      for (const row of data) {
        const id = Number(row.id)
        const nm = String(row.name ?? '')
        const k = teamLookupNormalize(nm)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: nm })
        }
      }
      continue
    }
    for (const name of part) {
      const { data: one, error: e2 } = await supabase.from('teams').insert({ name }).select('id, name').maybeSingle()
      if (!e2 && one?.id != null) {
        const id = Number(one.id)
        const k = teamLookupNormalize(name)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: String(one.name ?? name) })
        }
        continue
      }
      const { data: sel } = await supabase.from('teams').select('id, name').eq('name', name).maybeSingle()
      if (sel?.id != null) {
        const id = Number(sel.id)
        const k = teamLookupNormalize(name)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: String(sel.name ?? name) })
        }
      } else {
        errors.push(`Could not create or resolve team "${name}": ${e2?.message ?? error?.message ?? 'unknown'}`)
      }
    }
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

/**
 * Teams-tab provinces → `game_matches.home_team_province` / `away_team_province`.
 * Short codes (FS, WP, …) must match `fixture_groups.name` so `trg_sync_game_match_groups_from_fields`
 * (after insert/update on `game_matches`) inserts canonical `game_match_groups` rows, not ad-hoc slug rows.
 */
function canonicalProvinceGroup(raw: string): { value: string | null; warning?: string } {
  const t = raw.trim()
  if (!t) return { value: null }
  return { value: normalizeProvinceLabelForGameMatches(t) }
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
  let matches_inserted = 0
  let matches_updated = 0
  let syncTimedOut = false
  let lastProcessedFixtureRow: string | undefined

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
      group_link_failures: 0,
      skipped_group_linking_count: 0,
      game_matches_inserted: 0,
      game_matches_updated: 0,
      matches_inserted: 0,
      matches_updated: 0,
      sync_import_notice: dryRun ? undefined : SYNC_IMPORT_FOLLOWUP_NOTICE,
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
      league_group: normalizeLeagueGroupForGameMatches(r.league_group.trim()),
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

  if (!dryRun) {
    const syncImportStartedMs = Date.now()
    syncTimedOut = false
    lastProcessedFixtureRow = undefined

    const completedTeamIdCache = new Map<string, number>()

    type GmInsertBatchItem = {
      pairOnDate: string
      kind: 'upcoming' | 'completed'
      body: Record<string, unknown>
    }
    type GmUpdateBatchItem = {
      pairOnDate: string
      kind: 'upcoming' | 'completed'
      id: string
      reactivate: boolean
      body: Record<string, unknown>
      prevAdminNotes: string | null
    }

    const gmInserts: GmInsertBatchItem[] = []
    const gmUpdates: GmUpdateBatchItem[] = []
    const matchRowUpdates: { id: number; team_a_score: number; team_b_score: number; season: number }[] = []
    const matchRowInserts: {
      team_a_id: number
      team_b_id: number
      team_a_score: number
      team_b_score: number
      match_date: string
      season: number
    }[] = []

    const checkTime = () => {
      if (Date.now() - syncImportStartedMs > SYNC_IMPORT_MAX_MS) {
        syncTimedOut = true
        errors.push(
          `Sheet sync exceeded ${SYNC_IMPORT_MAX_MS / 1000}s before finishing all rows (last step: ${lastProcessedFixtureRow ?? 'unknown'}).`
        )
        return true
      }
      return false
    }

    if (!checkTime()) {
      await batchEnsureTeamIdsForCompletedRows(supabase, normalized, teams, completedTeamIdCache, errors)
    }

    if (!syncTimedOut && !checkTime()) {
      for (let ni = 0; ni < normalized.length; ni += 1) {
        const row = normalized[ni]
        lastProcessedFixtureRow = `${row.match_date} ${row.home_team} vs ${row.away_team} (${ni + 1}/${normalized.length})`
        if (checkTime()) break

        const pairOnDate = `${row.match_date}|${orderedPairKey(row.home_team, row.away_team)}`
        if (row.status === 'upcoming') {
          const { warnEff, sheetWarn } = buildLinkContext(row)
          const upLeague = normalizeLeagueGroupForGameMatches(row.league_group.trim())
          const upHomeTeamProv = normalizeProvinceLabelForGameMatches(row.home_team_province.trim())
          const upAwayTeamProv = normalizeProvinceLabelForGameMatches(row.away_team_province.trim())
          const rowLabelUp = `${row.home_team} vs ${row.away_team}`
          const warnUp = collectGroupLinkResolutionWarnings(fixtureGroupMaps, warnEff, sheetWarn, rowLabelUp)
          group_link_warnings += warnUp.messages.length
          for (const w of warnUp.messages) errors.push(w)
          const existingGmUp = existingGameMatchByPairOnDate.get(pairOnDate)
          if (existingGmUp?.id) {
            gmUpdates.push({
              pairOnDate,
              kind: 'upcoming',
              id: existingGmUp.id,
              reactivate:
                existingGmUp.status === 'rejected' || existingGmUp.verification_status === 'rejected',
              prevAdminNotes: existingGmUp.admin_notes,
              body: {
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
              },
            })
          } else {
            gmInserts.push({
              pairOnDate,
              kind: 'upcoming',
              body: {
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
              },
            })
          }
          continue
        }

        if (row.status !== 'completed') continue

        const homeTeamId = completedTeamIdCache.get(teamLookupNormalize(row.home_team))
        const awayTeamId = completedTeamIdCache.get(teamLookupNormalize(row.away_team))
        if (homeTeamId === undefined || awayTeamId === undefined) {
          errors.push(
            `Completed row team id missing after batch resolve (${row.home_team} vs ${row.away_team})`
          )
          continue
        }
        if (homeTeamId === awayTeamId) {
          errors.push(`Completed row resolved to same team id (${row.home_team} vs ${row.away_team})`)
          continue
        }
        if (row.home_score == null || row.away_score == null) {
          errors.push(`Completed row missing score (${row.home_team} vs ${row.away_team})`)
          continue
        }

        const { warnEff, sheetWarn } = buildLinkContext(row)
        const dbLeague = normalizeLeagueGroupForGameMatches(row.league_group.trim()) || null
        const dbHomeTeamProv = normalizeProvinceLabelForGameMatches(row.home_team_province.trim())
        const dbAwayTeamProv = normalizeProvinceLabelForGameMatches(row.away_team_province.trim())

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
          matchRowUpdates.push({
            id: duplicateMatch.id,
            team_a_score: row.home_score,
            team_b_score: row.away_score,
            season: Number(row.match_date.slice(0, 4)),
          })
        } else {
          matchRowInserts.push({
            team_a_id: homeTeamId,
            team_b_id: awayTeamId,
            team_a_score: row.home_score,
            team_b_score: row.away_score,
            match_date: row.match_date,
            season: Number(row.match_date.slice(0, 4)),
          })
        }

        const existingGmCompleted = existingGameMatchByPairOnDate.get(pairOnDate) ?? null
        const gmCompletedBody: Record<string, unknown> = {
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
        }
        if (existingGmCompleted) {
          gmUpdates.push({
            pairOnDate,
            kind: 'completed',
            id: existingGmCompleted.id,
            reactivate: false,
            prevAdminNotes: existingGmCompleted.admin_notes,
            body: gmCompletedBody,
          })
        } else {
          gmInserts.push({ pairOnDate, kind: 'completed', body: gmCompletedBody })
        }

        const rowLabelC = `${row.home_team} vs ${row.away_team}`
        const warnC = collectGroupLinkResolutionWarnings(fixtureGroupMaps, warnEff, sheetWarn, rowLabelC)
        group_link_warnings += warnC.messages.length
        for (const w of warnC.messages) errors.push(w)
      }
    }

    let upcomingUpsertFailed = false

    if (!syncTimedOut) {
      for (let bi = 0; bi < gmInserts.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = gmInserts.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.log(`Batch ${i} inserted`, slice.length)
        const { data, error } = await supabase
          .from('game_matches')
          .insert(slice.map((s) => s.body))
          .select('id, kickoff_time, home_team, away_team')
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`game_matches batch insert failed: ${error.message}`)
          break
        }
        for (let j = 0; j < slice.length; j += 1) {
          const meta = slice[j]
          const ret = data?.[j]
          if (!ret?.id) continue
          const id = String(ret.id)
          const st = meta.kind === 'completed' ? 'completed' : 'upcoming'
          existingGameMatchByPairOnDate.set(meta.pairOnDate, {
            id,
            kickoff_time: String(ret.kickoff_time),
            home_team: String(ret.home_team),
            away_team: String(ret.away_team),
            status: st,
            verification_status: 'verified',
            admin_notes: null,
          })
          if (meta.kind === 'upcoming') {
            existingCurrentUpcomingIdsByKey.set(meta.pairOnDate, id)
            inserted_upcoming += 1
          } else {
            existingCurrentUpcomingIdsByKey.delete(meta.pairOnDate)
            inserted_completed += 1
          }
        }
      }
    }

    if (!syncTimedOut) {
      for (let bi = 0; bi < gmUpdates.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = gmUpdates.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.log(`Batch ${i} game_matches updated`, slice.length)
        const rows = slice.map((s) => ({ id: s.id, ...s.body }))
        const { error } = await supabase.from('game_matches').upsert(rows, { onConflict: 'id' })
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`game_matches batch upsert failed: ${error.message}`)
          break
        }
        for (const u of slice) {
          const prev = existingGameMatchByPairOnDate.get(u.pairOnDate)
          existingGameMatchByPairOnDate.set(u.pairOnDate, {
            id: u.id,
            kickoff_time: String(u.body.kickoff_time),
            home_team: String(u.body.home_team),
            away_team: String(u.body.away_team),
            status: u.kind === 'completed' ? 'completed' : 'upcoming',
            verification_status: 'verified',
            admin_notes: u.prevAdminNotes ?? prev?.admin_notes ?? null,
          })
          if (u.kind === 'completed') {
            existingCurrentUpcomingIdsByKey.delete(u.pairOnDate)
            updated_completed += 1
          } else {
            existingCurrentUpcomingIdsByKey.set(u.pairOnDate, u.id)
            if (u.reactivate) reactivated_upcoming += 1
            else updated_upcoming += 1
          }
        }
      }
    }

    if (!syncTimedOut) {
      for (let bi = 0; bi < matchRowUpdates.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = matchRowUpdates.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.log(`Batch ${i} matches updated`, slice.length)
        const rowsWithExistingId = slice.map((r) => ({
          id: r.id,
          team_a_score: r.team_a_score,
          team_b_score: r.team_b_score,
          season: r.season,
        }))
        const { error } = await supabase.from('matches').upsert(rowsWithExistingId, { onConflict: 'id' })
        if (error) {
          errors.push(`matches batch upsert failed: ${error.message}`)
          break
        }
        matches_updated += slice.length
      }
    }

    if (!syncTimedOut) {
      for (let bi = 0; bi < matchRowInserts.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = matchRowInserts.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.log(`Batch ${i} matches inserted`, slice.length)
        const rowsWithoutId = slice.map((r) => ({
          team_a_id: r.team_a_id,
          team_b_id: r.team_b_id,
          team_a_score: r.team_a_score,
          team_b_score: r.team_b_score,
          match_date: r.match_date,
          season: r.season,
        }))
        const { data, error } = await supabase
          .from('matches')
          .insert(rowsWithoutId)
          .select('id, team_a_id, team_b_id, match_date')
        if (error) {
          errors.push(`matches batch insert failed: ${error.message}`)
          break
        }
        matches_inserted += slice.length
        for (let j = 0; j < slice.length; j += 1) {
          const ins = slice[j]
          const ret = data?.[j]
          if (!ret?.id) continue
          if (!existingMatchesByDate.has(ins.match_date)) existingMatchesByDate.set(ins.match_date, [])
          existingMatchesByDate.get(ins.match_date)?.push({
            id: ret.id as number,
            team_a_id: ret.team_a_id as number,
            team_b_id: ret.team_b_id as number,
          })
        }
      }
    }

    if (replaceUpcoming && !upcomingUpsertFailed && !syncTimedOut) {
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
  const group_link_failures = 0
  const game_matches_inserted = inserted_upcoming + inserted_completed
  const game_matches_updated = updated_upcoming + updated_completed

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
    linked_groups: 0,
    group_link_warnings,
    group_link_failures,
    skipped_group_linking_count: 0,
    game_matches_inserted,
    game_matches_updated,
    matches_inserted,
    matches_updated,
    completed_matches_scored: 0,
    post_sync_sweep_scored: 0,
    post_sync_sweep_attempted: 0,
    group_link_repair_examined: 0,
    group_link_repair_linked: 0,
    ...(!dryRun && !syncTimedOut ? { sync_import_notice: SYNC_IMPORT_FOLLOWUP_NOTICE } : {}),
    ...(syncTimedOut && !dryRun && lastProcessedFixtureRow
      ? { last_processed_fixture_row: lastProcessedFixtureRow }
      : {}),
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

  if (!dryRun && syncTimedOut) {
    return NextResponse.json(
      {
        ok: false,
        error: `Sheet sync exceeded ${SYNC_IMPORT_MAX_MS / 1000}s before finishing all rows.`,
        ...responseSummary,
      },
      { status: 408 }
    )
  }

  return NextResponse.json({
    ok: true,
    ...responseSummary,
  })
}
