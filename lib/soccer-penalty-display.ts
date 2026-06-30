export type SoccerPenaltySide = 'home' | 'away'

export function penaltyWinnerTeamName(
  side: SoccerPenaltySide,
  homeTeam: string,
  awayTeam: string
): string {
  return side === 'home' ? homeTeam : awayTeam
}

/** Locked prediction label, e.g. "1 - 1, Netherlands on penalties." */
export function formatSoccerLockedPredictionLabel(
  homeGoals: string,
  awayGoals: string,
  penaltyWinner: SoccerPenaltySide | null | undefined,
  homeTeam: string,
  awayTeam: string
): string {
  const score = `${homeGoals} - ${awayGoals}`
  if (!penaltyWinner) return score
  const team = penaltyWinnerTeamName(penaltyWinner, homeTeam, awayTeam)
  return `${score}, ${team} on penalties.`
}

/**
 * Match result with optional penalties, e.g.
 * "Netherlands 1–1 Morocco, Netherlands won on penalties."
 * Falls back to "Draw." when draw without penalty winner.
 */
export function formatSoccerMatchResultWithPenalties(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  penaltyWinner: SoccerPenaltySide | null | undefined
): string {
  if (homeScore === awayScore) {
    if (!penaltyWinner) return 'Draw.'
    const winner = penaltyWinnerTeamName(penaltyWinner, homeTeam, awayTeam)
    return `${homeTeam} ${homeScore}–${awayScore} ${awayTeam}, ${winner} won on penalties.`
  }
  return `${homeTeam} ${homeScore}–${awayScore} ${awayTeam}`
}
