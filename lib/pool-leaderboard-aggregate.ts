/** Mirrors `pool_leaderboard` SQL aggregation for unit tests. */

export type PoolLeaderboardMember = {
  user_id: string
  joined_at: string
}

export type PoolLeaderboardScoreInput = {
  user_id: string
  match_id: string
  prediction_id: string
  total_points: number
  margin_difference: number | null
  winner_correct: boolean
  margin_points: number
  scored_at: string
}

export type PoolLeaderboardAggregateRow = {
  user_id: string
  total_points: number
  total_margin_difference: number
  average_margin_difference: number | null
  games_predicted: number
  correct_winners: number
  margin_points_total: number
}

export function aggregatePoolLeaderboard(
  members: PoolLeaderboardMember[],
  effectiveMatchIds: string[],
  scores: PoolLeaderboardScoreInput[]
): PoolLeaderboardAggregateRow[] {
  const matchSet = new Set(effectiveMatchIds)

  return members.map((member) => {
    const memberScores = scores.filter(
      (s) =>
        s.user_id === member.user_id &&
        matchSet.has(s.match_id) &&
        new Date(s.scored_at) >= new Date(member.joined_at)
    )

    const totalPoints = memberScores.reduce((sum, s) => sum + s.total_points, 0)
    const totalMarginDifference = memberScores.reduce(
      (sum, s) => sum + (s.margin_difference ?? 0),
      0
    )
    const marginValues = memberScores
      .map((s) => s.margin_difference)
      .filter((v): v is number => v != null)
    const averageMarginDifference =
      marginValues.length > 0
        ? marginValues.reduce((sum, v) => sum + v, 0) / marginValues.length
        : null
    const gamesPredicted = memberScores.length
    const correctWinners = memberScores.filter((s) => s.winner_correct).length
    const marginPointsTotal = memberScores.reduce((sum, s) => sum + s.margin_points, 0)

    return {
      user_id: member.user_id,
      total_points: totalPoints,
      total_margin_difference: totalMarginDifference,
      average_margin_difference: averageMarginDifference,
      games_predicted: gamesPredicted,
      correct_winners: correctWinners,
      margin_points_total: marginPointsTotal,
    }
  })
}

export function isScoreInPoolScope(
  score: Pick<PoolLeaderboardScoreInput, 'match_id' | 'scored_at'>,
  member: Pick<PoolLeaderboardMember, 'joined_at'>,
  effectiveMatchIds: string[]
): boolean {
  return (
    effectiveMatchIds.includes(score.match_id) &&
    new Date(score.scored_at) >= new Date(member.joined_at)
  )
}
