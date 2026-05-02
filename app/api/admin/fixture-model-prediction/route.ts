import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { getConsistencyModelSettings, toStrongOpponentBoostParams } from '@/lib/consistency-model-settings'
import {
  predictFixtureFullResult,
  PREDICTOR_MODEL_VERSION,
  type Match as PredictorMatch,
  type PredictionResult,
  type Team as PredictorTeam,
  type TeamConsistencyRow,
} from '@/lib/prediction-model'
import { buildTeamAliasResolverMap, type TeamAliasDbRow } from '@/lib/team-aliases-db'
import { matchTeamName, type TeamRow } from '@/lib/team-name-match'

export const runtime = 'nodejs'

type OkBody = {
  ok: true
  modelVersion: string
  fixtureHomeTeam: string
  fixtureAwayTeam: string
  season: number
  /** Team id → name for interpreting paths and summaries */
  teams: PredictorTeam[]
  result: PredictionResult
}

type ErrBody = {
  ok: false
  error: string
  code?: 'unresolved_teams' | 'no_paths' | 'forbidden' | 'bad_request'
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Missing Authorization bearer token', code: 'forbidden' },
      { status: 401 }
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Server misconfigured', code: 'bad_request' },
      { status: 500 }
    )
  }

  const supabaseUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Forbidden', code: 'forbidden' },
      { status: 403 }
    )
  }

  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabaseUser, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Forbidden', code: 'forbidden' },
      { status: 403 }
    )
  }

  let body: {
    kickoffTime?: string
    season?: number
    homeTeamName?: string
    awayTeamName?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Invalid JSON body', code: 'bad_request' },
      { status: 400 }
    )
  }

  const kickoffTime = typeof body.kickoffTime === 'string' ? body.kickoffTime.trim() : ''
  const homeTeamName = typeof body.homeTeamName === 'string' ? body.homeTeamName.trim() : ''
  const awayTeamName = typeof body.awayTeamName === 'string' ? body.awayTeamName.trim() : ''
  const season =
    typeof body.season === 'number' && Number.isFinite(body.season)
      ? body.season
      : new Date(kickoffTime).getFullYear()

  if (!kickoffTime || !homeTeamName || !awayTeamName) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'kickoffTime, homeTeamName, and awayTeamName are required', code: 'bad_request' },
      { status: 400 }
    )
  }

  const fixtureMs = new Date(kickoffTime).getTime()
  if (Number.isNaN(fixtureMs)) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Invalid kickoffTime', code: 'bad_request' },
      { status: 400 }
    )
  }

  const [
    { data: teamRows, error: teamsErr },
    { data: aliasRows, error: aliasErr },
    { data: seasonMatchesRaw, error: matchesErr },
    { data: consistencyData, error: consistencyErr },
    consistencySettings,
  ] = await Promise.all([
    supabaseUser.from('teams').select('id, name').order('name'),
    supabaseUser.from('team_aliases').select('*'),
    supabaseUser
      .from('matches')
      .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
      .eq('season', season),
    supabaseUser
      .from('team_consistency')
      .select('team_id, adjusted_consistency, consistency_score, is_anchor, anchor_status')
      .eq('season', season),
    getConsistencyModelSettings(supabaseUser, season),
  ])

  if (teamsErr || !teamRows?.length) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: teamsErr?.message || 'Could not load teams', code: 'bad_request' },
      { status: 500 }
    )
  }
  if (matchesErr) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: matchesErr.message, code: 'bad_request' },
      { status: 500 }
    )
  }
  if (consistencyErr) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: consistencyErr.message, code: 'bad_request' },
      { status: 500 }
    )
  }
  if (aliasErr) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: aliasErr.message, code: 'bad_request' },
      { status: 500 }
    )
  }

  const teams = teamRows as TeamRow[]
  const aliasMap = buildTeamAliasResolverMap((aliasRows as TeamAliasDbRow[]) ?? [], teams)

  const homeRes = matchTeamName(homeTeamName, teams, aliasMap)
  const awayRes = matchTeamName(awayTeamName, teams, aliasMap)

  if (!homeRes.matchedTeamId || !awayRes.matchedTeamId) {
    return NextResponse.json<ErrBody>(
      {
        ok: false,
        error:
          'Could not resolve one or both team names to database teams. Check spelling or team aliases.',
        code: 'unresolved_teams',
      },
      { status: 422 }
    )
  }

  if (homeRes.matchedTeamId === awayRes.matchedTeamId) {
    return NextResponse.json<ErrBody>(
      { ok: false, error: 'Home and away resolve to the same team.', code: 'bad_request' },
      { status: 400 }
    )
  }

  const allSeasonMatches = (seasonMatchesRaw ?? []) as PredictorMatch[]
  const beforeFixture = allSeasonMatches.filter((m) => new Date(m.match_date).getTime() < fixtureMs)

  const consistencyMap = new Map<number, TeamConsistencyRow>()
  for (const row of (consistencyData || []) as TeamConsistencyRow[]) {
    consistencyMap.set(row.team_id, row)
  }

  const boostParams = toStrongOpponentBoostParams(consistencySettings)

  const predictorTeams: PredictorTeam[] = teams.map((t) => ({ id: t.id, name: t.name }))

  const full = predictFixtureFullResult(
    homeRes.matchedTeamId,
    awayRes.matchedTeamId,
    beforeFixture,
    predictorTeams,
    consistencyMap,
    boostParams
  )

  if (!full.ok) {
    return NextResponse.json<ErrBody>(
      {
        ok: false,
        error:
          'Not enough linked results before this fixture to build a margin (no paths in the model graph).',
        code: 'no_paths',
      },
      { status: 422 }
    )
  }

  const payload: OkBody = {
    ok: true,
    modelVersion: PREDICTOR_MODEL_VERSION,
    fixtureHomeTeam: homeTeamName,
    fixtureAwayTeam: awayTeamName,
    season,
    teams: predictorTeams,
    result: full.result,
  }

  return NextResponse.json(payload)
}
