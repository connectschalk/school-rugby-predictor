import type { SoccerPenaltySide } from '@/lib/soccer-exact-score-scoring'

export type SoccerPredictionForWinnerCheck = {
  predicted_home_score: number
  predicted_away_score: number
  predicted_penalty_winner?: SoccerPenaltySide | null
  predicted_winner?: 'home' | 'away' | 'draw' | null
}

export type SoccerActualForWinnerCheck = {
  home_score: number
  away_score: number
  penalty_winner?: SoccerPenaltySide | null
}

function predictedResultFromScores(home: number, away: number): 'home' | 'away' | 'draw' {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

/**
 * Mirrors `score_predictions_for_match` soccer `winner_correct` (must always be boolean, never null).
 */
export function soccerPredictionWinnerCorrect(
  prediction: SoccerPredictionForWinnerCheck,
  actual: SoccerActualForWinnerCheck
): boolean {
  const actualResult = predictedResultFromScores(actual.home_score, actual.away_score)
  const scoredActualWinner =
    actualResult === 'draw' && actual.penalty_winner != null
      ? actual.penalty_winner
      : actualResult

  if (actualResult === 'draw' && actual.penalty_winner != null) {
    if (
      prediction.predicted_penalty_winner != null &&
      prediction.predicted_penalty_winner === actual.penalty_winner
    ) {
      return true
    }
    if (
      prediction.predicted_penalty_winner == null &&
      (prediction.predicted_winner === 'home' || prediction.predicted_winner === 'away') &&
      prediction.predicted_winner === actual.penalty_winner
    ) {
      return true
    }
    return false
  }

  const predictedResult = predictedResultFromScores(
    prediction.predicted_home_score,
    prediction.predicted_away_score
  )
  return predictedResult === scoredActualWinner
}

export function soccerScoredActualWinner(actual: SoccerActualForWinnerCheck): 'home' | 'away' | 'draw' {
  const actualResult = predictedResultFromScores(actual.home_score, actual.away_score)
  if (actualResult === 'draw' && actual.penalty_winner != null) {
    return actual.penalty_winner
  }
  return actualResult
}
