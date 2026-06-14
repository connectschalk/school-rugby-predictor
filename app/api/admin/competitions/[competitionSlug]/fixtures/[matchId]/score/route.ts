import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'
import { resolveCompetitionAdminMatch } from '@/lib/admin-competition-fixture-api'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'

type RouteParams = { params: Promise<{ competitionSlug: string; matchId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  const { competitionSlug, matchId } = await params
  const resolved = await resolveCompetitionAdminMatch(auth.supabase, competitionSlug, matchId)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  if (resolved.match.status !== 'completed') {
    return NextResponse.json(
      { ok: false, error: 'Match must be completed before scoring predictions' },
      { status: 400 }
    )
  }
  if (resolved.match.home_score == null || resolved.match.away_score == null) {
    return NextResponse.json(
      { ok: false, error: 'Match must have home_score and away_score before scoring' },
      { status: 400 }
    )
  }

  const { scoredCount, error: scoreErr } = await rpcScorePredictionsForMatch(
    auth.supabase,
    resolved.match.id
  )

  if (scoreErr) {
    return NextResponse.json({
      ok: false,
      scored: false,
      scoring_error: scoreErr.message,
      message: 'Scoring failed. Please try again.',
      match_id: resolved.match.id,
    })
  }

  return NextResponse.json({
    ok: true,
    scored: true,
    scored_count: scoredCount,
    message: 'Predictions scored.',
    match_id: resolved.match.id,
  })
}
