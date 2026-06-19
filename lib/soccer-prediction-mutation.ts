import type { SupabaseClient } from '@supabase/supabase-js'
import { SOCCER_GOALS_MAX } from '@/lib/predict-score-common'
import { PREDICTION_KICKOFF_LOCK_MESSAGE } from '@/lib/prediction-cutoff'

export type SoccerPredictionInput = {
  matchId: string
  predictedHomeScore: number
  predictedAwayScore: number
}

export type SoccerPredictionTarget = SoccerPredictionInput & {
  userId: string
}

export function parseSoccerPredictionScores(
  home: unknown,
  away: unknown
): { home: number; away: number } | { error: string } {
  if (typeof home !== 'number' || typeof away !== 'number' || !Number.isFinite(home) || !Number.isFinite(away)) {
    return { error: 'Enter home and away goals (0–20).' }
  }
  const predictedHomeScore = Math.trunc(home)
  const predictedAwayScore = Math.trunc(away)
  if (
    predictedHomeScore < 0 ||
    predictedHomeScore > SOCCER_GOALS_MAX ||
    predictedAwayScore < 0 ||
    predictedAwayScore > SOCCER_GOALS_MAX
  ) {
    return { error: `Goals must be integers between 0 and ${SOCCER_GOALS_MAX}.` }
  }
  return { home: predictedHomeScore, away: predictedAwayScore }
}

/** Server-side gate: upcoming fixture with kickoff still in the future. */
export async function assertMatchOpenForUserSoccerPrediction(
  client: SupabaseClient,
  matchId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await client
    .from('game_matches')
    .select('id, status, kickoff_time')
    .eq('id', matchId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'Could not verify match status.', status: 500 }
  }
  if (!data) {
    return { ok: false, error: 'Match not found.', status: 404 }
  }

  const row = data as { status: string; kickoff_time: string }
  if (row.status !== 'upcoming') {
    return { ok: false, error: PREDICTION_KICKOFF_LOCK_MESSAGE, status: 409 }
  }

  const { data: openRows, error: openErr } = await client
    .from('game_matches')
    .select('id')
    .eq('id', matchId)
    .eq('status', 'upcoming')
    .gt('kickoff_time', new Date().toISOString())
    .limit(1)

  if (openErr) {
    return { ok: false, error: 'Could not verify match kickoff.', status: 500 }
  }
  if (!openRows?.length) {
    return { ok: false, error: PREDICTION_KICKOFF_LOCK_MESSAGE, status: 409 }
  }

  return { ok: true }
}

export async function upsertSoccerPredictionRow(
  client: SupabaseClient,
  target: SoccerPredictionTarget
): Promise<{ error: string | null }> {
  const { error } = await client.from('user_predictions').upsert(
    {
      match_id: target.matchId,
      user_id: target.userId,
      predicted_home_score: target.predictedHomeScore,
      predicted_away_score: target.predictedAwayScore,
      predicted_winner: null,
      predicted_margin: null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,match_id' }
  )

  if (!error) return { error: null }

  const msg = error.message.toLowerCase()
  if (msg.includes('kickoff') || msg.includes('upcoming') || msg.includes('row-level security')) {
    return { error: PREDICTION_KICKOFF_LOCK_MESSAGE }
  }
  if (msg.includes('locked_prediction_immutable')) {
    return { error: 'This prediction is locked and cannot be changed.' }
  }
  return { error: error.message }
}
