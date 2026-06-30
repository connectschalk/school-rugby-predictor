/** Soccer exact-score prediction scoring (max 3 points per fixture). */

export const SOCCER_EXACT_SCORE_POINTS = 3

export type SoccerPredictionOutcome = 'exact' | 'close' | 'correct' | 'wrong'

export type SoccerPredictionScore = {
  points: 0 | 1 | 2 | 3
  outcome: SoccerPredictionOutcome
}

export type SoccerMatchResult = {
  homeScore: number
  awayScore: number
}

export type SoccerPenaltySide = 'home' | 'away'

export type ScoreSoccerPredictionOptions = {
  predictedPenaltyWinner?: SoccerPenaltySide | null
  actualPenaltyWinner?: SoccerPenaltySide | null
  /** Legacy rugby-style winner on old soccer rows (home/away only). */
  legacyPredictedWinner?: 'home' | 'away' | 'draw' | null
}

function resultFromScore(home: number, away: number): 'home' | 'away' | 'draw' {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function goalDifference(home: number, away: number): number {
  return home - away
}

function totalAbsoluteError(
  predictedHomeScore: number,
  predictedAwayScore: number,
  actualHomeScore: number,
  actualAwayScore: number
): number {
  return (
    Math.abs(predictedHomeScore - actualHomeScore) +
    Math.abs(predictedAwayScore - actualAwayScore)
  )
}

function isCloseScore(
  predictedHomeScore: number,
  predictedAwayScore: number,
  actualHomeScore: number,
  actualAwayScore: number,
  actualResult: 'home' | 'away' | 'draw'
): boolean {
  if (totalAbsoluteError(predictedHomeScore, predictedAwayScore, actualHomeScore, actualAwayScore) <= 1) {
    return true
  }

  const predDiff = goalDifference(predictedHomeScore, predictedAwayScore)
  const actualDiff = goalDifference(actualHomeScore, actualAwayScore)
  if (predDiff !== actualDiff) return false

  if (actualResult === 'draw') {
    return (
      Math.abs(predictedHomeScore - actualHomeScore) <= 1 &&
      Math.abs(predictedAwayScore - actualAwayScore) <= 1
    )
  }

  return true
}

/**
 * Standard soccer scoring (normal time only, no penalty shootout layer).
 *
 * - 3: exact scoreline
 * - 2: correct result + close
 * - 1: correct result only
 * - 0: wrong result
 */
export function scoreSoccerPredictionNormalTime(
  predictedHomeScore: number,
  predictedAwayScore: number,
  actualHomeScore: number,
  actualAwayScore: number
): SoccerPredictionScore {
  if (
    predictedHomeScore === actualHomeScore &&
    predictedAwayScore === actualAwayScore
  ) {
    return { points: 3, outcome: 'exact' }
  }

  const predResult = resultFromScore(predictedHomeScore, predictedAwayScore)
  const actualResult = resultFromScore(actualHomeScore, actualAwayScore)

  if (predResult !== actualResult) {
    return { points: 0, outcome: 'wrong' }
  }

  if (
    isCloseScore(
      predictedHomeScore,
      predictedAwayScore,
      actualHomeScore,
      actualAwayScore,
      actualResult
    )
  ) {
    return { points: 2, outcome: 'close' }
  }

  return { points: 1, outcome: 'correct' }
}

function scoreSoccerPredictionWithPenaltyShootout(
  predictedHomeScore: number,
  predictedAwayScore: number,
  actualHomeScore: number,
  actualAwayScore: number,
  options: Required<Pick<ScoreSoccerPredictionOptions, 'actualPenaltyWinner'>> &
    ScoreSoccerPredictionOptions
): SoccerPredictionScore {
  const { predictedPenaltyWinner, actualPenaltyWinner, legacyPredictedWinner } = options
  const exactScore =
    predictedHomeScore === actualHomeScore && predictedAwayScore === actualAwayScore

  if (
    exactScore &&
    predictedPenaltyWinner != null &&
    predictedPenaltyWinner === actualPenaltyWinner
  ) {
    return { points: 3, outcome: 'exact' }
  }

  if (predictedPenaltyWinner != null && predictedPenaltyWinner === actualPenaltyWinner) {
    return { points: 2, outcome: 'close' }
  }

  if (exactScore && predictedPenaltyWinner == null) {
    return { points: 2, outcome: 'close' }
  }

  if (
    predictedPenaltyWinner == null &&
    (legacyPredictedWinner === 'home' || legacyPredictedWinner === 'away') &&
    legacyPredictedWinner === actualPenaltyWinner
  ) {
    return { points: 2, outcome: 'close' }
  }

  if (
    exactScore &&
    predictedPenaltyWinner != null &&
    predictedPenaltyWinner !== actualPenaltyWinner
  ) {
    return { points: 1, outcome: 'correct' }
  }

  return scoreSoccerPredictionNormalTime(
    predictedHomeScore,
    predictedAwayScore,
    actualHomeScore,
    actualAwayScore
  )
}

/**
 * Score a soccer exact-score prediction against the actual result.
 * When the actual match was a knockout draw decided on penalties, applies the
 * penalty-shootout scoring layer before falling back to normal-time rules.
 */
export function scoreSoccerPrediction(
  predictedHomeScore: number,
  predictedAwayScore: number,
  actualHomeScore: number,
  actualAwayScore: number,
  options: ScoreSoccerPredictionOptions = {}
): SoccerPredictionScore {
  const actualIsDraw = actualHomeScore === actualAwayScore
  const actualPenaltyWinner = options.actualPenaltyWinner ?? null

  if (actualIsDraw && actualPenaltyWinner != null) {
    return scoreSoccerPredictionWithPenaltyShootout(
      predictedHomeScore,
      predictedAwayScore,
      actualHomeScore,
      actualAwayScore,
      { ...options, actualPenaltyWinner }
    )
  }

  return scoreSoccerPredictionNormalTime(
    predictedHomeScore,
    predictedAwayScore,
    actualHomeScore,
    actualAwayScore
  )
}

/** @deprecated Use {@link scoreSoccerPrediction} instead. */
export function scoreSoccerExactPrediction(
  prediction: SoccerMatchResult,
  actual: SoccerMatchResult
): SoccerPredictionScore['points'] {
  return scoreSoccerPrediction(
    prediction.homeScore,
    prediction.awayScore,
    actual.homeScore,
    actual.awayScore
  ).points
}
