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

export {
  scoreSoccerExactPrediction,
  scoreSoccerPrediction,
  SOCCER_EXACT_SCORE_POINTS,
  type SoccerPredictionOutcome,
  type SoccerPredictionScore,
} from '@/lib/soccer-exact-score-scoring'
