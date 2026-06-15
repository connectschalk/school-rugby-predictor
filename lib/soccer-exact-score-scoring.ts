/** Soccer World Cup exact-score prediction scoring (max 4 points per fixture). */

export type SoccerMatchResult = {
  homeScore: number
  awayScore: number
}

export type SoccerPredictionPoints = 0 | 1 | 2 | 4

function resultFromScore(home: number, away: number): 'home' | 'away' | 'draw' {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function goalDifference(home: number, away: number): number {
  return home - away
}

/**
 * Score a soccer exact-score prediction against the actual normal-time result.
 *
 * - 4: exact scoreline
 * - 2: correct result (win/draw) and correct goal difference
 * - 1: correct result only
 * - 0: wrong result
 */
export function scoreSoccerExactPrediction(
  prediction: SoccerMatchResult,
  actual: SoccerMatchResult
): SoccerPredictionPoints {
  const predResult = resultFromScore(prediction.homeScore, prediction.awayScore)
  const actualResult = resultFromScore(actual.homeScore, actual.awayScore)

  if (
    prediction.homeScore === actual.homeScore &&
    prediction.awayScore === actual.awayScore
  ) {
    return 4
  }

  const resultCorrect = predResult === actualResult
  if (!resultCorrect) return 0

  if (actualResult === 'draw') return 1

  const predDiff = goalDifference(prediction.homeScore, prediction.awayScore)
  const actualDiff = goalDifference(actual.homeScore, actual.awayScore)
  if (predDiff === actualDiff) return 2

  return 1
}
