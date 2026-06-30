import { NextResponse } from 'next/server'
import { ensureUserProfileExists } from '@/lib/user-profile-metadata'
import { requireAuthenticatedApi } from '@/lib/predictions-api-auth'
import {
  assertMatchOpenForUserSoccerPrediction,
  parseSoccerPenaltyWinner,
  parseSoccerPredictionScores,
  upsertSoccerPredictionRow,
} from '@/lib/soccer-prediction-mutation'
import { SUPABASE_PUBLIC } from '@/lib/supabase-public-access'

type Body = {
  match_id?: string
  predicted_home_score?: number
  predicted_away_score?: number
  predicted_penalty_winner?: string | null
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedApi(request)
  if (auth instanceof NextResponse) return auth

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const matchId = typeof body.match_id === 'string' ? body.match_id.trim() : ''
  if (!matchId) {
    return NextResponse.json({ error: 'Match is required.' }, { status: 400 })
  }

  const parsed = parseSoccerPredictionScores(body.predicted_home_score, body.predicted_away_score)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const parsedPenalty = parseSoccerPenaltyWinner(body.predicted_penalty_winner)
  if ('error' in parsedPenalty) {
    return NextResponse.json({ error: parsedPenalty.error }, { status: 400 })
  }

  const gate = await assertMatchOpenForUserSoccerPrediction(auth.supabase, matchId)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { data: matchRow, error: matchErr } = await auth.supabase
    .from(SUPABASE_PUBLIC.gameMatches)
    .select('fixture_round, league_group, competition_id')
    .eq('id', matchId)
    .maybeSingle()

  if (matchErr) {
    return NextResponse.json({ error: 'Could not verify match.' }, { status: 500 })
  }
  if (!matchRow) {
    return NextResponse.json({ error: 'Match not found.' }, { status: 404 })
  }

  const { error: profileErr } = await ensureUserProfileExists(auth.supabase, auth.user)
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  const match = matchRow as {
    fixture_round: string | null
    league_group: string | null
    competition_id: string | null
  }
  let competitionSlug: string | null = null
  if (match.competition_id) {
    const { data: competition } = await auth.supabase
      .from('competitions')
      .select('slug')
      .eq('id', match.competition_id)
      .maybeSingle()
    competitionSlug = competition?.slug ?? null
  }

  const { error } = await upsertSoccerPredictionRow(auth.supabase, {
    matchId,
    userId: auth.user.id,
    predictedHomeScore: parsed.home,
    predictedAwayScore: parsed.away,
    predictedPenaltyWinner: parsedPenalty.value,
    fixtureRound: match.fixture_round,
    leagueGroup: match.league_group,
    competitionSlug: competitionSlug ?? null,
  })

  if (error) {
    const status = error.includes('locked') ? 409 : 500
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({ ok: true })
}
