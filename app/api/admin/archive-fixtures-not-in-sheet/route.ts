import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { parseFixturesSheetCsv } from '@/lib/parse-fixtures-sheet-csv'
import { parseTeamsSheetCsv, SheetTeamsRegistry } from '@/lib/sheet-teams-registry'
import { computeSheetFixtureNormKeys } from '@/lib/sheet-fixture-norm-set'
import { dateInSastFromIso } from '@/lib/sast-date'
import { buildStableSheetFixtureKey, normalizeStableFixtureKeyForLookup } from '@/lib/sync-sheet-fixture-key'
import type { TeamAliasDbRow } from '@/lib/team-aliases-db'
import { buildSheetSyncAliasMap, canonicalTeamLabelForGameMatches } from '@/lib/team-canonical-for-sync'
import type { TeamRow } from '@/lib/team-name-match'

export const runtime = 'nodejs'

const ARCHIVE_NOTE = 'Archived: not in current Google Sheet (Teams + Fixtures)'

type GameMatchArchiveRow = {
  id: string
  kickoff_time: string
  home_team: string
  away_team: string
  fixture_key: string | null
  home_score: number | null
  away_score: number | null
  status: string
  verification_status: string | null
  admin_notes: string | null
}

function normKeyForGameMatch(
  gm: GameMatchArchiveRow,
  teamRegistry: SheetTeamsRegistry,
  teams: TeamRow[],
  sheetSyncAliasMap: Map<string, string>
): string {
  if (gm.fixture_key?.trim()) {
    return normalizeStableFixtureKeyForLookup(gm.fixture_key.trim())
  }
  const d = dateInSastFromIso(gm.kickoff_time)
  const h = canonicalTeamLabelForGameMatches(gm.home_team, teamRegistry, teams, sheetSyncAliasMap)
  const a = canonicalTeamLabelForGameMatches(gm.away_team, teamRegistry, teams, sheetSyncAliasMap)
  return normalizeStableFixtureKeyForLookup(buildStableSheetFixtureKey(d, h, a))
}

async function collectMatchIdsWithActivity(supabase: SupabaseClient): Promise<{ ids: Set<string>; error: string | null }> {
  const linked = new Set<string>()
  const tables: { table: string; col: string; filterNull?: boolean }[] = [
    { table: 'user_predictions', col: 'match_id' },
    { table: 'game_match_comments', col: 'match_id' },
    { table: 'user_prediction_scores', col: 'match_id' },
    { table: 'pool_matches', col: 'match_id' },
    { table: 'pool_comments', col: 'match_id', filterNull: true },
    { table: 'one_match_challenges', col: 'match_id' },
  ]
  for (const { table, col, filterNull } of tables) {
    let q = supabase.from(table).select(col)
    if (filterNull) {
      q = q.not(col, 'is', null)
    }
    const { data, error } = await q
    if (error) {
      return { ids: linked, error: `Cannot scan ${table} for activity: ${error.message}` }
    }
    for (const row of data ?? []) {
      const r = row as unknown as Record<string, unknown>
      const id = r[col]
      if (typeof id === 'string' && id) linked.add(id)
    }
  }
  return { ids: linked, error: null }
}

export async function POST(request: Request) {
  const reqUrl = new URL(request.url)
  const dryRun = reqUrl.searchParams.get('dry_run') === '1'

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
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }
  if (!fixturesCsvUrl || !teamsCsvUrl) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_SHEET_FIXTURES_CSV_URL and GOOGLE_SHEET_TEAMS_CSV_URL are required' },
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

  const teamsParsed = parseTeamsSheetCsv(await teamsCsvRes.text())
  const teamRegistry = new SheetTeamsRegistry(teamsParsed.rows)
  const parsed = parseFixturesSheetCsv(await fixturesCsvRes.text())
  const errors: string[] = [...teamsParsed.errors, ...parsed.errors]

  const { data: teamsData, error: teamsErr } = await supabase.from('teams').select('id, name, canonical_name')
  if (teamsErr) {
    return NextResponse.json({ ok: false, error: `Could not load teams: ${teamsErr.message}` }, { status: 500 })
  }
  const teams = (teamsData as TeamRow[] | null) ?? []
  const { data: aliasRows } = await supabase.from('team_aliases').select('*')
  const sheetSyncAliasMap = buildSheetSyncAliasMap(
    teamsParsed.rows,
    (aliasRows as TeamAliasDbRow[]) ?? [],
    teams
  )

  const { keys: sheetKeys, errors: keyErrors } = computeSheetFixtureNormKeys(
    parsed.rows,
    teamRegistry,
    teams,
    sheetSyncAliasMap
  )
  errors.push(...keyErrors)
  if (!sheetKeys.size && parsed.rows.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Could not derive any sheet fixture keys (fix Teams / Fixtures CSV errors).',
        validation_errors: errors,
      },
      { status: 400 }
    )
  }

  const { data: gmData, error: gmErr } = await supabase
    .from('game_matches')
    .select('id, kickoff_time, home_team, away_team, fixture_key, home_score, away_score, status, verification_status, admin_notes')
  if (gmErr) {
    return NextResponse.json({ ok: false, error: `Could not load game_matches: ${gmErr.message}` }, { status: 500 })
  }

  const rows = (gmData as GameMatchArchiveRow[] | null) ?? []
  const { ids: activityIds, error: actErr } = await collectMatchIdsWithActivity(supabase)
  if (actErr) {
    return NextResponse.json({ ok: false, error: actErr }, { status: 500 })
  }

  let examined = 0
  let skipped_on_sheet = 0
  let skipped_has_scores = 0
  let skipped_has_activity = 0
  const toArchive: GameMatchArchiveRow[] = []

  for (const gm of rows) {
    examined += 1
    const norm = normKeyForGameMatch(gm, teamRegistry, teams, sheetSyncAliasMap)
    if (sheetKeys.has(norm)) {
      skipped_on_sheet += 1
      continue
    }
    if (gm.home_score != null || gm.away_score != null) {
      skipped_has_scores += 1
      continue
    }
    if (activityIds.has(gm.id)) {
      skipped_has_activity += 1
      continue
    }
    toArchive.push(gm)
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      examined,
      would_archive: toArchive.length,
      skipped_on_sheet,
      skipped_has_scores,
      skipped_has_activity,
      validation_errors: errors,
    })
  }

  let archived = 0
  const archiveFailures: string[] = []
  for (const gm of toArchive) {
    const combinedNotes = [gm.admin_notes?.trim(), ARCHIVE_NOTE].filter(Boolean).join(' | ')
    const { error } = await supabase
      .from('game_matches')
      .update({
        verification_status: 'rejected',
        rejected_reason: ARCHIVE_NOTE,
        admin_notes: combinedNotes || null,
      })
      .eq('id', gm.id)
    if (error) {
      archiveFailures.push(`Archive failed for id=${gm.id}: ${error.message}`)
      continue
    }
    archived += 1
  }
  errors.push(...archiveFailures)

  return NextResponse.json({
    ok: archiveFailures.length === 0,
    dry_run: false,
    examined,
    archived,
    skipped_on_sheet,
    skipped_has_scores,
    skipped_has_activity,
    validation_errors: errors,
  })
}
