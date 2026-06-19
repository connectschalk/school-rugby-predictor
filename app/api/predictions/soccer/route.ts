import { NextResponse } from 'next/server'
import { ensureUserProfileExists } from '@/lib/user-profile-metadata'
import { requireAuthenticatedApi } from '@/lib/predictions-api-auth'
import {
  assertMatchOpenForUserSoccerPrediction,
  parseSoccerPredictionScores,
  upsertSoccerPredictionRow,
} from '@/lib/soccer-prediction-mutation'

type Body = {
  match_id?: string
  predicted_home_score?: number
  predicted_away_score?: number
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

  const gate = await assertMatchOpenForUserSoccerPrediction(auth.supabase, matchId)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const profileErr = await ensureUserProfileExists(auth.supabase, auth.user)
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  const { error } = await upsertSoccerPredictionRow(auth.supabase, {
    matchId,
    userId: auth.user.id,
    predictedHomeScore: parsed.home,
    predictedAwayScore: parsed.away,
  })

  if (error) {
    const status = error.includes('locked') ? 409 : 500
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({ ok: true })
}
