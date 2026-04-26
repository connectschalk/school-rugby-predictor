export type GameActualWinner = 'home' | 'away' | 'draw'

export type PredictionScoreBreakdown = {
  winner_correct: boolean
  actual_winner: GameActualWinner
  actual_margin: number
  margin_difference: number | null
  winner_points: number
  margin_points: number
  total_points: number
}

/**
 * Scoring for the public Predict a Score game (keep in sync with
 * `score_predictions_for_match` in Supabase migrations).
 *
 * Rules: wrong winner → 0 total. Correct winner → 2 pts + margin band (max 5).
 * Max per match = 7.
 */
export function computePredictionScore(
  predicted_winner: 'home' | 'away',
  predicted_margin: number,
  home_score: number,
  away_score: number
): PredictionScoreBreakdown {
  let actual_winner: GameActualWinner
  if (home_score > away_score) actual_winner = 'home'
  else if (away_score > home_score) actual_winner = 'away'
  else actual_winner = 'draw'

  const actual_margin = Math.abs(home_score - away_score)

  const winner_correct =
    actual_winner !== 'draw' && predicted_winner === actual_winner

  const winner_points = winner_correct ? 2 : 0

  let margin_points = 0
  let margin_difference: number | null = null

  if (winner_correct) {
    margin_difference = Math.abs(predicted_margin - actual_margin)
    if (margin_difference === 0) margin_points = 5
    else if (margin_difference === 1) margin_points = 4
    else if (margin_difference === 2) margin_points = 3
    else if (margin_difference === 3) margin_points = 2
    else if (margin_difference === 4) margin_points = 1
    else margin_points = 0
  }

  const total_points = winner_points + margin_points

  return {
    winner_correct,
    actual_winner,
    actual_margin,
    margin_difference,
    winner_points,
    margin_points,
    total_points,
  }
}
