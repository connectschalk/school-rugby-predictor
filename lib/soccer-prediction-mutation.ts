import type { SupabaseClient } from '@supabase/supabase-js'
import { SOCCER_GOALS_MAX } from '@/lib/predict-score-common'
import { isKnockoutSoccerFixture } from '@/lib/soccer-knockout-fixture'
import type { SoccerPenaltySide } from '@/lib/soccer-exact-score-scoring'
import { PREDICTION_KICKOFF_LOCK_MESSAGE } from '@/lib/prediction-cutoff'

export type SoccerPredictionInput = {
  matchId: string
  predictedHomeScore: number
  predictedAwayScore: number
  predictedPenaltyWinner?: SoccerPenaltySide | null
  fixtureRound?: string | null
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

export function parseSoccerPenaltyWinner(
  value: unknown
): { value: SoccerPenaltySide | null } | { error: string } {
  if (value == null || value === '') return { value: null }
  if (value === 'home' || value === 'away') return { value }
  return { error: 'Penalty winner must be home or away.' }
}

export function validateSoccerPenaltyPrediction(
  homeScore: number,
  awayScore: number,
  penaltyWinner: SoccerPenaltySide | null,
  fixtureRound?: string | null
): { ok: true; penaltyWinner: SoccerPenaltySide | null } | { ok: false; error: string } {
  const isDraw = homeScore === awayScore
  const knockout = isKnockoutSoccerFixture(fixtureRound)

  if (!isDraw) {
    if (penaltyWinner != null) {
      return { ok: false, error: 'Clear the penalty winner when the predicted score is not a draw.' }
    }
    return { ok: true, penaltyWinner: null }
  }

  if (knockout) {
    if (penaltyWinner == null) {
      return { ok: false, error: 'Choose which team wins on penalties for a drawn knockout score.' }
    }
    return { ok: true, penaltyWinner }
  }

  if (penaltyWinner != null) {
    return { ok: false, error: 'Penalty winner is only required for knockout draws.' }
  }
  return { ok: true, penaltyWinner: null }
}

/** Server-side gate: upcoming fixture with kickoff still in the future. */
export function validateAdminMatchPenaltyResult(
  homeScore: number,
  awayScore: number,
  penaltyWinner: SoccerPenaltySide | null,
  fixtureRound?: string | null
): { ok: true; penaltyWinner: SoccerPenaltySide | null } | { ok: false; error: string } {
  return validateSoccerPenaltyPrediction(homeScore, awayScore, penaltyWinner, fixtureRound)
}

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
  const penaltyCheck = validateSoccerPenaltyPrediction(
    target.predictedHomeScore,
    target.predictedAwayScore,
    target.predictedPenaltyWinner ?? null,
    target.fixtureRound
  )
  if (!penaltyCheck.ok) {
    return { error: penaltyCheck.error }
  }

  const { error } = await client.from('user_predictions').upsert(
    {
      match_id: target.matchId,
      user_id: target.userId,
      predicted_home_score: target.predictedHomeScore,
      predicted_away_score: target.predictedAwayScore,
      predicted_penalty_winner: penaltyCheck.penaltyWinner,
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
