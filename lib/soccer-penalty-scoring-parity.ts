import {
  scoreSoccerPrediction,
  type SoccerPenaltySide,
} from '@/lib/soccer-exact-score-scoring'

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

  if (actualResult === 'draw' && actual.penalty_winner != null) {
    if (prediction.predicted_penalty_winner != null) {
      return prediction.predicted_penalty_winner === actual.penalty_winner
    }
    if (prediction.predicted_winner != null) {
      return (
        (prediction.predicted_winner === 'home' || prediction.predicted_winner === 'away') &&
        prediction.predicted_winner === actual.penalty_winner
      )
    }
    return false
  }

  const predictedResult = predictedResultFromScores(
    prediction.predicted_home_score,
    prediction.predicted_away_score
  )
  return predictedResult === actualResult
}

export function soccerScoredActualWinner(actual: SoccerActualForWinnerCheck): 'home' | 'away' | 'draw' {
  const actualResult = predictedResultFromScores(actual.home_score, actual.away_score)
  if (actualResult === 'draw' && actual.penalty_winner != null) {
    return actual.penalty_winner
  }
  return actualResult
}

/** Human-readable reason for points awarded (mirrors scoring rules modal copy). */
export function soccerScoringReasonLabel(
  prediction: SoccerPredictionForWinnerCheck,
  actual: SoccerActualForWinnerCheck
): string {
  const { points } = scoreSoccerPrediction(
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    actual.home_score,
    actual.away_score,
    {
      predictedPenaltyWinner: prediction.predicted_penalty_winner,
      actualPenaltyWinner: actual.penalty_winner,
      legacyPredictedWinner: prediction.predicted_winner,
    }
  )

  const actualIsPenaltyDraw =
    actual.home_score === actual.away_score && actual.penalty_winner != null

  if (actualIsPenaltyDraw) {
    if (points === 3) return 'Exact draw score and correct penalty winner'
    if (points === 2) {
      if (
        prediction.predicted_home_score === actual.home_score &&
        prediction.predicted_away_score === actual.away_score &&
        prediction.predicted_penalty_winner == null
      ) {
        return 'Exact draw scoreline (legacy prediction without penalty pick)'
      }
      if (
        prediction.predicted_penalty_winner != null &&
        prediction.predicted_penalty_winner === actual.penalty_winner
      ) {
        return 'Correct team to advance on penalties'
      }
      if (
        prediction.predicted_penalty_winner == null &&
        (prediction.predicted_winner === 'home' || prediction.predicted_winner === 'away') &&
        prediction.predicted_winner === actual.penalty_winner
      ) {
        return 'Correct advancing team (legacy winner pick)'
      }
      return 'Correct result with close score'
    }
    if (points === 1) {
      if (
        prediction.predicted_home_score === actual.home_score &&
        prediction.predicted_away_score === actual.away_score
      ) {
        return 'Exact draw score but wrong penalty winner'
      }
      return 'Partially correct (penalty shootout)'
    }
    return 'Wrong team to advance'
  }

  if (points === 3) return 'Exact scoreline'
  if (points === 2) return 'Correct result with close score'
  if (points === 1) return 'Correct result only'
  return 'Wrong result'
}
