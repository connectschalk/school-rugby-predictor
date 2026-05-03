import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildStructuredWarningsFromStrings, type SyncWarningItem } from '@/lib/sync-master-warnings'
import { splitCsvLine } from '@/lib/parse-game-matches-bulk'
import {
  linkMatchToFixtureGroup,
  loadFixtureGroupMaps,
  resolveGroupIdForRow,
  resolvePrestigePoolGroupId,
} from '@/lib/fixture-group-resolve'
import { relinkAllCompletedMatchesToFixtureGroups } from '@/lib/repair-missing-fixture-group-links'
import { scoreCompletedPredictionMatches } from '@/lib/score-completed-unscored-matches'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'
import { buildTeamAliasResolverMap } from '@/lib/team-aliases-db'
import { matchTeamName, type TeamRow } from '@/lib/team-name-match'

export const runtime = 'nodejs'

type MasterCsvRow = {
  date: string
  time: string
  home_team: string
  away_team: string
  home_score: string
  away_score: string
  province_group: string
  league_group: string
  is_prestige: string
  status: string
  verification_status: string
  source: string
  pair_key: string
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
}

function normalizeHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_')
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

function normalizeTime(v: string): string {
  const s = v.trim()
  if (!s) return '11:00'
  const hm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hm) return `${String(Number(hm[1])).padStart(2, '0')}:${hm[2]}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return '11:00'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`
}

function toSastKickoffIso(dateYmd: string, hhmm: string): string {
  return `${dateYmd}T${hhmm}:00+02:00`
}

function normalizeStatus(v: string): 'upcoming' | 'completed' {
  const s = v.trim().toLowerCase()
  return s === 'completed' ? 'completed' : 'upcoming'
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

function parseCsvRows(csvText: string): { rows: MasterCsvRow[]; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], errors: ['CSV is empty'] }

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
    province_group: firstIdx(['province_group', 'province']),
    league_group: firstIdx(['league_group', 'league']),
    is_prestige: firstIdx(['is_prestige', 'prestige']),
    status: header.indexOf('status'),
    verification_status: header.indexOf('verification_status'),
    source: header.indexOf('source'),
    pair_key: header.indexOf('pair_key'),
  }
  if (idx.date < 0 || idx.home_team < 0 || idx.away_team < 0) {
    return { rows: [], errors: ['CSV requires at least date, home_team, away_team headers'] }
  }

  const rows: MasterCsvRow[] = []
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
      province_group: read('province_group'),
      league_group: read('league_group'),
      is_prestige: read('is_prestige'),
      status: read('status'),
      verification_status: read('verification_status'),
      source: read('source'),
      pair_key: read('pair_key'),
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
  const csvUrl = process.env.GOOGLE_FIXTURE_MASTER_CSV_URL
  if (!url || !anonKey || !csvUrl) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured for sheet sync' }, { status: 500 })
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

  const csvRes = await fetch(csvUrl)
  if (!csvRes.ok) {
    return NextResponse.json({ ok: false, error: `Could not fetch master sheet CSV (${csvRes.status})` }, { status: 400 })
  }
  const csvText = await csvRes.text()
  const parsed = parseCsvRows(csvText)
  errors.push(...parsed.errors)
  if (!parsed.rows.length) {
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

  const normalized: Array<{
    kickoff_time: string
    match_date: string
    home_team: string
    away_team: string
    home_score: number | null
    away_score: number | null
    province_group: string
    league_group: string
    is_prestige: boolean
    status: 'upcoming' | 'completed'
    verification_status: 'draft' | 'needs_review' | 'verified' | 'rejected'
    source: string
    dedupe_key: string
  }> = []

  const seen = new Set<string>()
  const pairKeyCounts = new Map<string, number>()
  const teamDayCounts = new Map<string, number>()
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const r = parsed.rows[i]
    const date = normalizeDate(r.date)
    const time = normalizeTime(r.time)
    const home = r.home_team.trim()
    const away = r.away_team.trim()
    if (!date || !home || !away) {
      errors.push(`Row ${i + 2}: missing required date/home_team/away_team`)
      continue
    }
    if (home.toLowerCase() === away.toLowerCase()) {
      errors.push(`Row ${i + 2}: home_team and away_team are the same`)
      continue
    }
    const dedupe = r.pair_key?.trim() || `${date}|${orderedPairKey(home, away)}`
    pairKeyCounts.set(dedupe, (pairKeyCounts.get(dedupe) ?? 0) + 1)
    if (seen.has(dedupe)) {
      skipped_duplicates += 1
      continue
    }
    seen.add(dedupe)

    const province = canonicalProvinceGroup(r.province_group.trim())
    if (province.warning) {
      province_group_warnings += 1
      errors.push(`Warning row ${i + 2}: ${province.warning}`)
    }

    normalized.push({
      kickoff_time: toSastKickoffIso(date, time),
      match_date: date,
      home_team: home,
      away_team: away,
      home_score: toNumOrNull(r.home_score),
      away_score: toNumOrNull(r.away_score),
      province_group: province.value ?? '',
      league_group: r.league_group.trim(),
      is_prestige: parseBool(r.is_prestige),
      status: normalizeStatus(r.status),
      verification_status: normalizeVerification(r.verification_status),
      source: r.source.trim(),
      dedupe_key: dedupe,
    })

    const homeDay = `${date}|${home.toLowerCase()}`
    const awayDay = `${date}|${away.toLowerCase()}`
    teamDayCounts.set(homeDay, (teamDayCounts.get(homeDay) ?? 0) + 1)
    teamDayCounts.set(awayDay, (teamDayCounts.get(awayDay) ?? 0) + 1)
  }

  for (const [pair, count] of pairKeyCounts.entries()) {
    if (count > 1) errors.push(`Warning: duplicate pair_key encountered (${pair})`)
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
  const { data: aliasData } = await supabase.from('team_aliases').select('*')
  if (teamsErr) {
    return NextResponse.json({ ok: false, error: `Could not load teams for completed rows: ${teamsErr.message}` }, { status: 500 })
  }
  const teams = (teamsData as TeamRow[] | null) ?? []
  const aliasMap = buildTeamAliasResolverMap((aliasData as Record<string, unknown>[] | null) ?? [], teams)

  const { aliasToGroupId, nameToGroupId, slugToGroupId } = await loadFixtureGroupMaps(supabase)

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
      const resolved = resolveGroupIdForRow(
        row.league_group,
        row.province_group,
        aliasToGroupId,
        nameToGroupId,
        slugToGroupId
      )
      if (resolved.groupId) {
        would_link_groups += 1
      } else if (resolved.sourceValue) {
        group_link_warnings += 1
        errors.push(`Warning: no fixture group found for "${resolved.sourceValue}" (${row.home_team} vs ${row.away_team})`)
      }
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

    const homeMatch = matchTeamName(row.home_team, teams, aliasMap)
    const awayMatch = matchTeamName(row.away_team, teams, aliasMap)
    if (!homeMatch.matchedTeamId || !awayMatch.matchedTeamId) {
      errors.push(`Completed row team resolution failed (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (homeMatch.matchedTeamId === awayMatch.matchedTeamId) {
      errors.push(`Completed row has same team IDs (${row.home_team} vs ${row.away_team})`)
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
  let upcomingUpsertFailed = false
  /** Each successful upcoming or completed `game_matches` insert/update is followed by `linkMatchToFixtureGroup`. */
  for (const row of normalized) {
    const pairOnDate = `${row.match_date}|${orderedPairKey(row.home_team, row.away_team)}`
    if (row.status === 'upcoming') {
      const upLeague = (row.league_group ?? '').trim()
      const upProvince = (row.province_group ?? '').trim()
      const resolvedGroup = resolveGroupIdForRow(
        upLeague,
        upProvince,
        aliasToGroupId,
        nameToGroupId,
        slugToGroupId
      )
      const prestigeLinkIds: string[] = []
      if (row.is_prestige) {
        const pid = resolvePrestigePoolGroupId({ aliasToGroupId, nameToGroupId, slugToGroupId })
        if (pid) prestigeLinkIds.push(pid)
        else {
          errors.push(
            `Warning: is_prestige is true (${row.home_team} vs ${row.away_team}) but Prestige Pool fixture group was not found`
          )
        }
      }
      const existingGmUp = existingGameMatchByPairOnDate.get(pairOnDate)
      let touchedMatchId: string | null = null
      if (existingGmUp?.id) {
        const { error } = await supabase
          .from('game_matches')
          .update({
            kickoff_time: row.kickoff_time,
            home_team: row.home_team,
            away_team: row.away_team,
            province_group: upProvince || null,
            league_group: upLeague || null,
            is_prestige: !!row.is_prestige,
            status: 'upcoming',
            verification_status: 'verified',
            source_name: row.source || 'Google Fixture Master',
            source_url: csvUrl,
            source_type: 'google_sheet_master',
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
          status: 'upcoming',
          verification_status: 'verified',
          province_group: upProvince || null,
          league_group: upLeague || null,
          is_prestige: !!row.is_prestige,
          source_name: row.source || 'Google Fixture Master',
          source_url: csvUrl,
          source_type: 'google_sheet_master',
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
        const gl = await linkMatchToFixtureGroup(
          supabase,
          touchedMatchId,
          resolvedGroup,
          `${row.home_team} vs ${row.away_team}`,
          errors,
          prestigeLinkIds
        )
        linked_groups += gl.linked_groups
        group_link_warnings += gl.group_link_warnings
      }
      continue
    }

    // completed — group fields always come from the sheet row; DB is updated before linking (see game_matches update/insert below).
    const homeMatch = matchTeamName(row.home_team, teams, aliasMap)
    const awayMatch = matchTeamName(row.away_team, teams, aliasMap)
    if (!homeMatch.matchedTeamId || !awayMatch.matchedTeamId) {
      errors.push(`Completed row team resolution failed (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (homeMatch.matchedTeamId === awayMatch.matchedTeamId) {
      errors.push(`Completed row has same team IDs (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (row.home_score == null || row.away_score == null) {
      errors.push(`Completed row missing score (${row.home_team} vs ${row.away_team})`)
      continue
    }

    const sheetLeague = (row.league_group ?? '').trim()
    const sheetProvince = (row.province_group ?? '').trim()
    if (!sheetLeague && !sheetProvince && !row.is_prestige) {
      errors.push(
        `Warning: completed sheet row has empty league_group and province_group and is_prestige is false (${row.home_team} vs ${row.away_team}, ${row.match_date}) — add province/league on the sheet or in fixture management so pool fixture groups can be linked.`
      )
    }

    const existingForDate = existingMatchesByDate.get(row.match_date) ?? []
    const duplicateMatch = existingForDate.find((m) => {
      const a = m.team_a_id
      const b = m.team_b_id
      return (
        (a === homeMatch.matchedTeamId && b === awayMatch.matchedTeamId) ||
        (a === awayMatch.matchedTeamId && b === homeMatch.matchedTeamId)
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
          team_a_id: homeMatch.matchedTeamId,
          team_b_id: awayMatch.matchedTeamId,
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
          province_group: sheetProvince || null,
          league_group: sheetLeague || null,
          is_prestige: !!row.is_prestige,
          rejected_reason: null,
          source_name: row.source || 'Google Fixture Master',
          source_url: csvUrl,
          source_type: 'google_sheet_master',
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
          province_group: sheetProvince || null,
          league_group: sheetLeague || null,
          is_prestige: !!row.is_prestige,
          rejected_reason: null,
          source_name: row.source || 'Google Fixture Master',
          source_url: csvUrl,
          source_type: 'google_sheet_master',
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

    const resolvedGroupCompleted = resolveGroupIdForRow(
      sheetLeague,
      sheetProvince,
      aliasToGroupId,
      nameToGroupId,
      slugToGroupId
    )

    const completedPrestigeIds: string[] = []
    if (row.is_prestige) {
      const pid = resolvePrestigePoolGroupId({ aliasToGroupId, nameToGroupId, slugToGroupId })
      if (pid) completedPrestigeIds.push(pid)
      else {
        errors.push(
          `Warning: is_prestige is true for completed row (${row.home_team} vs ${row.away_team}, ${row.match_date}) but Prestige Pool fixture group was not found`
        )
      }
    }

    if (completedGmTouchedId) {
      const gl = await linkMatchToFixtureGroup(
        supabase,
        completedGmTouchedId,
        resolvedGroupCompleted,
        `${row.home_team} vs ${row.away_team}`,
        errors,
        completedPrestigeIds
      )
      linked_groups += gl.linked_groups
      group_link_warnings += gl.group_link_warnings
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
    const note = 'Replaced by Google Sheet master sync'
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

  if (!dryRun) {
    try {
      const rep = await relinkAllCompletedMatchesToFixtureGroups(supabase)
      group_link_repair_examined = rep.processed
      group_link_repair_linked = rep.linked
      for (const w of rep.warnings) errors.push(w)
    } catch (e) {
      errors.push(
        `Warning: completed fixture group relink failed: ${e instanceof Error ? e.message : String(e)}`
      )
    }
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
