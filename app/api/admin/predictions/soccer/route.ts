import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'
import {
  parseSoccerPenaltyWinner,
  parseSoccerPredictionScores,
  upsertSoccerPredictionRow,
} from '@/lib/soccer-prediction-mutation'

type Body = {
  user_id?: string
  match_id?: string
  predicted_home_score?: number
  predicted_away_score?: number
  predicted_penalty_winner?: string | null
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const matchId = typeof body.match_id === 'string' ? body.match_id.trim() : ''
  if (!userId || !matchId) {
    return NextResponse.json({ ok: false, error: 'user_id and match_id are required.' }, { status: 400 })
  }

  const parsed = parseSoccerPredictionScores(body.predicted_home_score, body.predicted_away_score)
  if ('error' in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
  }

  const parsedPenalty = parseSoccerPenaltyWinner(body.predicted_penalty_winner)
  if ('error' in parsedPenalty) {
    return NextResponse.json({ ok: false, error: parsedPenalty.error }, { status: 400 })
  }

  const { data: matchRow, error: matchErr } = await auth.supabase
    .from('game_matches')
    .select('id, fixture_round, league_group, competitions(slug)')
    .eq('id', matchId)
    .maybeSingle()

  if (matchErr) {
    return NextResponse.json({ ok: false, error: 'Could not verify match.' }, { status: 500 })
  }
  if (!matchRow) {
    return NextResponse.json({ ok: false, error: 'Match not found.' }, { status: 404 })
  }

  const match = matchRow as {
    fixture_round: string | null
    league_group: string | null
    competitions: { slug: string } | { slug: string }[] | null
  }
  const competition = match.competitions
  const competitionSlug = Array.isArray(competition) ? competition[0]?.slug : competition?.slug

  const { error } = await upsertSoccerPredictionRow(auth.supabase, {
    matchId,
    userId,
    predictedHomeScore: parsed.home,
    predictedAwayScore: parsed.away,
    predictedPenaltyWinner: parsedPenalty.value,
    fixtureRound: match.fixture_round,
    leagueGroup: match.league_group,
    competitionSlug: competitionSlug ?? null,
  })

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
