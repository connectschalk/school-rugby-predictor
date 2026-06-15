/**
 * Soccer exact-score and rugby margin scoring mirrors (DB `score_predictions_for_match` is canonical).
 */

export type RugbyPredictionInput = {
  predicted_winner: 'home' | 'away'
  predicted_margin: number
}

export type SoccerPredictionInput = {
  predicted_home_score: number
  predicted_away_score: number
}

export { scoreSoccerExactPrediction } from '@/lib/soccer-exact-score-scoring'
