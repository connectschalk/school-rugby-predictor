import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildStructuredWarningsFromStrings, type SyncWarningItem } from '@/lib/sync-master-warnings'
import { splitCsvLine } from '@/lib/parse-game-matches-bulk'
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

function slugifyGroupName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  return { value: null, warning: `Unknown province_group "${t}" mapped to null` }
}

function resolveGroupIdForRow(
  leagueGroup: string,
  provinceGroup: string,
  aliasToGroupId: Map<string, string>,
  nameToGroupId: Map<string, string>,
  slugToGroupId: Map<string, string>
): { groupId: string | null; sourceValue: string | null } {
  const candidates = [leagueGroup.trim(), provinceGroup.trim()].filter(Boolean)
  for (const raw of candidates) {
    const key = raw.toLowerCase()
    const aliasHit = aliasToGroupId.get(key)
    if (aliasHit) return { groupId: aliasHit, sourceValue: raw }
    const nameHit = nameToGroupId.get(key)
    if (nameHit) return { groupId: nameHit, sourceValue: raw }
    const slugHit = slugToGroupId.get(slugifyGroupName(raw))
    if (slugHit) return { groupId: slugHit, sourceValue: raw }
  }
  return { groupId: null, sourceValue: candidates[0] ?? null }
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
  const idx = {
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    home_team: header.indexOf('home_team'),
    away_team: header.indexOf('away_team'),
    home_score: header.indexOf('home_score'),
    away_score: header.indexOf('away_score'),
    province_group: header.indexOf('province_group'),
    league_group: header.indexOf('league_group'),
    is_prestige: header.indexOf('is_prestige'),
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

  const { data: teamsData, error: teamsErr } = await supabase.from('teams').select('id, name')
  const { data: aliasData } = await supabase.from('team_aliases').select('*')
  if (teamsErr) {
    return NextResponse.json({ ok: false, error: `Could not load teams for completed rows: ${teamsErr.message}` }, { status: 500 })
  }
  const teams = (teamsData as TeamRow[] | null) ?? []
  const aliasMap = buildTeamAliasResolverMap((aliasData as Record<string, unknown>[] | null) ?? [], teams)

  const { data: fixtureGroupsData } = await supabase.from('fixture_groups').select('id, name, slug')
  const { data: fixtureGroupAliasesData } = await supabase
    .from('fixture_group_aliases')
    .select('alias, group_id')
  const aliasToGroupId = new Map<string, string>()
  const nameToGroupId = new Map<string, string>()
  const slugToGroupId = new Map<string, string>()
  for (const row of ((fixtureGroupsData as { id: string; name: string; slug: string }[] | null) ?? [])) {
    nameToGroupId.set((row.name ?? '').trim().toLowerCase(), row.id)
    if (row.slug) slugToGroupId.set(String(row.slug).trim().toLowerCase(), row.id)
  }
  for (const row of ((fixtureGroupAliasesData as { alias: string; group_id: string }[] | null) ?? [])) {
    if (!row.alias || !row.group_id) continue
    aliasToGroupId.set(row.alias.trim().toLowerCase(), row.group_id)
  }

  const { data: existingGameMatchesData, error: existingGameMatchesErr } = await supabase
    .from('game_matches')
    .select('id, kickoff_time, home_team, away_team, status, verification_status, admin_notes')
    .in('status', ['upcoming', 'completed', 'rejected', 'locked', 'cancelled'])
  if (existingGameMatchesErr) {
    return NextResponse.json({ ok: false, error: `Could not load existing game matches: ${existingGameMatchesErr.message}` }, { status: 500 })
  }

  const existingUpcomingByDatePair = new Map<
    string,
    { id: string; home_team: string; away_team: string; status: string; verification_status: string | null; admin_notes: string | null }
  >()
  const existingCompletedByDatePair = new Map<string, { id: string; home_team: string; away_team: string }>()
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
    if (row.status === 'upcoming') {
      existingCurrentUpcomingIdsByKey.set(key, row.id)
    }
    if (row.status !== 'completed') {
      if (!existingUpcomingByDatePair.has(key) || row.status === 'upcoming') {
        existingUpcomingByDatePair.set(key, {
          id: row.id,
          home_team: row.home_team,
          away_team: row.away_team,
          status: row.status,
          verification_status: row.verification_status,
          admin_notes: row.admin_notes,
        })
      }
    } else if (row.status === 'completed') {
      existingCompletedByDatePair.set(key, {
        id: row.id,
        home_team: row.home_team,
        away_team: row.away_team,
      })
    }
  }

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
      const existing = existingUpcomingByDatePair.get(pairOnDate)
      if (existing) {
        if (existing.status === 'rejected' || existing.verification_status === 'rejected') {
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
    const existingForDate = existingMatchesByDate.get(row.match_date) ?? []
    const hasMatchRow = existingForDate.some((m) => {
      const a = m.team_a_id
      const b = m.team_b_id
      return (
        (a === homeMatch.matchedTeamId && b === awayMatch.matchedTeamId) ||
        (a === awayMatch.matchedTeamId && b === homeMatch.matchedTeamId)
      )
    })
    if (hasMatchRow) would_update_completed += 1
    else would_insert_completed += 1
  }

  if (replaceUpcoming) {
    for (const key of existingCurrentUpcomingIdsByKey.keys()) {
      if (!sheetUpcomingKeys.has(key)) would_reject_old_upcoming += 1
    }
  }

  if (!dryRun) {
  let upcomingUpsertFailed = false
  for (const row of normalized) {
    const pairOnDate = `${row.match_date}|${orderedPairKey(row.home_team, row.away_team)}`
    if (row.status === 'upcoming') {
      const resolvedGroup = resolveGroupIdForRow(
        row.league_group,
        row.province_group,
        aliasToGroupId,
        nameToGroupId,
        slugToGroupId
      )
      const existingUpcoming = existingUpcomingByDatePair.get(pairOnDate)
      let touchedMatchId: string | null = null
      if (existingUpcoming?.id) {
        const { error } = await supabase
          .from('game_matches')
          .update({
            kickoff_time: row.kickoff_time,
            home_team: row.home_team,
            away_team: row.away_team,
            province_group: row.province_group || null,
            league_group: row.league_group || null,
            is_prestige: row.is_prestige,
            status: 'upcoming',
            verification_status: 'verified',
            source_name: row.source || 'Google Fixture Master',
            source_url: csvUrl,
            source_type: 'google_sheet_master',
            rejected_reason: null,
          })
          .eq('id', existingUpcoming.id)
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`Upcoming update failed (${row.home_team} vs ${row.away_team}): ${error.message}`)
        } else if (existingUpcoming.status === 'rejected' || existingUpcoming.verification_status === 'rejected') {
          reactivated_upcoming += 1
          touchedMatchId = existingUpcoming.id
        } else {
          updated_upcoming += 1
          touchedMatchId = existingUpcoming.id
        }
      } else {
        const { data: insertedRow, error } = await supabase.from('game_matches').insert({
          home_team: row.home_team,
          away_team: row.away_team,
          kickoff_time: row.kickoff_time,
          status: 'upcoming',
          verification_status: 'verified',
          province_group: row.province_group || null,
          league_group: row.league_group || null,
          is_prestige: row.is_prestige,
          source_name: row.source || 'Google Fixture Master',
          source_url: csvUrl,
          source_type: 'google_sheet_master',
        }).select('id').single()
        if (error) {
          upcomingUpsertFailed = true
          errors.push(`Upcoming insert failed (${row.home_team} vs ${row.away_team}): ${error.message}`)
        } else {
          inserted_upcoming += 1
          touchedMatchId = String(insertedRow?.id ?? '')
        }
      }

      if (touchedMatchId) {
        const { error: clearLinksErr } = await supabase
          .from('game_match_groups')
          .delete()
          .eq('match_id', touchedMatchId)
        if (clearLinksErr) {
          group_link_warnings += 1
          errors.push(`Warning: could not clear old group links for match ${touchedMatchId}: ${clearLinksErr.message}`)
        } else if (resolvedGroup.groupId) {
          const { error: linkErr } = await supabase
            .from('game_match_groups')
            .upsert(
              { match_id: touchedMatchId, group_id: resolvedGroup.groupId },
              { onConflict: 'match_id,group_id', ignoreDuplicates: true }
            )
          if (linkErr) {
            group_link_warnings += 1
            errors.push(`Warning: could not link fixture group for match ${touchedMatchId}: ${linkErr.message}`)
          } else {
            linked_groups += 1
          }
        } else if (resolvedGroup.sourceValue) {
          group_link_warnings += 1
          errors.push(`Warning: no fixture group found for "${resolvedGroup.sourceValue}" (${row.home_team} vs ${row.away_team})`)
        }
      }
      continue
    }

    // completed
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

    const existingGameMatch = existingCompletedByDatePair.get(pairOnDate) ?? null

    if (existingGameMatch) {
      const { error: gmUpdateErr } = await supabase
        .from('game_matches')
        .update({
          home_team: row.home_team,
          away_team: row.away_team,
          status: 'completed',
          home_score: row.home_score,
          away_score: row.away_score,
          verification_status: 'verified',
          province_group: row.province_group || null,
          league_group: row.league_group || null,
          is_prestige: row.is_prestige,
          source_name: row.source || 'Google Fixture Master',
          source_url: csvUrl,
          source_type: 'google_sheet_master',
        })
        .eq('id', existingGameMatch.id)
      if (gmUpdateErr) {
        errors.push(`Completed game_matches update failed (${row.home_team} vs ${row.away_team}): ${gmUpdateErr.message}`)
      } else {
        updated_completed += 1
      }
    } else {
      const { error: gmInsertErr } = await supabase.from('game_matches').insert({
        home_team: row.home_team,
        away_team: row.away_team,
        kickoff_time: row.kickoff_time,
        status: 'completed',
        home_score: row.home_score,
        away_score: row.away_score,
        verification_status: 'verified',
        province_group: row.province_group || null,
        league_group: row.league_group || null,
        is_prestige: row.is_prestige,
        source_name: row.source || 'Google Fixture Master',
        source_url: csvUrl,
        source_type: 'google_sheet_master',
      })
      if (gmInsertErr) {
        errors.push(`Completed game_matches insert failed (${row.home_team} vs ${row.away_team}): ${gmInsertErr.message}`)
      } else {
        inserted_completed += 1
        existingCompletedByDatePair.set(pairOnDate, {
          id: '',
          home_team: row.home_team,
          away_team: row.away_team,
        })
      }
    }
  }

  if (replaceUpcoming && !upcomingUpsertFailed) {
    const note = 'Replaced by Google Sheet master sync'
    for (const [key, id] of existingCurrentUpcomingIdsByKey.entries()) {
      if (sheetUpcomingKeys.has(key)) continue
      const existing = existingUpcomingByDatePair.get(key)
      const combinedNotes = [existing?.admin_notes?.trim(), note].filter(Boolean).join(' | ')
      const { error: rejectErr } = await supabase
        .from('game_matches')
        .update({
          verification_status: 'rejected',
          rejected_reason: note,
          admin_notes: combinedNotes || null,
        })
        .eq('id', id)
      if (rejectErr) {
        errors.push(`Could not reject existing upcoming fixture ${id}: ${rejectErr.message}`)
      } else {
        rejected_old_upcoming += 1
      }
    }
  } else if (replaceUpcoming && upcomingUpsertFailed) {
    errors.push('Replace mode skipped old-upcoming rejection because one or more upcoming upserts failed.')
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
