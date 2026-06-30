import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'
import {
  parseAdminScore,
  resolveCompetitionAdminMatch,
} from '@/lib/admin-competition-fixture-api'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'
import {
  parseSoccerPenaltyWinner,
  validateAdminMatchPenaltyResult,
} from '@/lib/soccer-prediction-mutation'

type RouteParams = { params: Promise<{ competitionSlug: string; matchId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  const { competitionSlug, matchId } = await params
  const resolved = await resolveCompetitionAdminMatch(auth.supabase, competitionSlug, matchId)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  let body: { home_score?: unknown; away_score?: unknown; penalty_winner?: unknown }
  try {
    body = (await request.json()) as {
      home_score?: unknown
      away_score?: unknown
      penalty_winner?: unknown
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const homeScore = parseAdminScore(body.home_score)
  const awayScore = parseAdminScore(body.away_score)
  if (homeScore == null || awayScore == null) {
    return NextResponse.json(
      { ok: false, error: 'home_score and away_score are required non-negative integers' },
      { status: 400 }
    )
  }

  const parsedPenalty = parseSoccerPenaltyWinner(body.penalty_winner)
  if ('error' in parsedPenalty) {
    return NextResponse.json({ ok: false, error: parsedPenalty.error }, { status: 400 })
  }

  let penaltyWinner: 'home' | 'away' | null = null
  if (resolved.competition.scoring_mode === 'soccer_exact_score') {
    const penaltyCheck = validateAdminMatchPenaltyResult(
      homeScore,
      awayScore,
      parsedPenalty.value,
      resolved.match.fixture_round
    )
    if (!penaltyCheck.ok) {
      return NextResponse.json({ ok: false, error: penaltyCheck.error }, { status: 400 })
    }
    penaltyWinner = penaltyCheck.penaltyWinner
  } else if (parsedPenalty.value != null) {
    return NextResponse.json(
      { ok: false, error: 'Penalty winner is only used for soccer competitions.' },
      { status: 400 }
    )
  }

  const { error: upErr } = await auth.supabase
    .from('game_matches')
    .update({
      home_score: homeScore,
      away_score: awayScore,
      penalty_winner: penaltyWinner,
      status: 'completed',
    })
    .eq('id', resolved.match.id)
    .eq('competition_id', resolved.competition.id)

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message, result_saved: false }, { status: 500 })
  }

  const { scoredCount, error: scoreErr } = await rpcScorePredictionsForMatch(
    auth.supabase,
    resolved.match.id
  )

  if (scoreErr) {
    return NextResponse.json({
      ok: true,
      result_saved: true,
      scored: false,
      scored_count: 0,
      scoring_error: scoreErr.message,
      message: 'Result saved, but scoring failed. Please retry scoring.',
      match_id: resolved.match.id,
    })
  }

  return NextResponse.json({
    ok: true,
    result_saved: true,
    scored: true,
    scored_count: scoredCount,
    message: 'Result saved and predictions scored.',
    match_id: resolved.match.id,
  })
}
