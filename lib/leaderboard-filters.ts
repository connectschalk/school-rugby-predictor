import { isSoccerExactScoreMode, type CompetitionScoringMode } from './competitions'

export type LeaderboardQualificationFilter = 'all' | 'qualified'

/** Rugby uses All / Qualified; soccer exact-score leaderboards show everyone. */
export function leaderboardShowsQualificationFilter(
  scoringMode: CompetitionScoringMode | string | null | undefined
): boolean {
  return !isSoccerExactScoreMode(scoringMode)
}

export function defaultLeaderboardQualificationFilter(
  scoringMode: CompetitionScoringMode | string | null | undefined
): LeaderboardQualificationFilter {
  return leaderboardShowsQualificationFilter(scoringMode) ? 'qualified' : 'all'
}

export function filterGlobalLeaderboardRows<
  T extends { predictions_made: number },
>(rows: T[], scoringMode: CompetitionScoringMode, qualification: LeaderboardQualificationFilter): T[] {
  if (!leaderboardShowsQualificationFilter(scoringMode) || qualification === 'all') {
    return rows
  }
  return rows.filter((r) => r.predictions_made >= 5)
}

export function filterPoolLeaderboardRows<T>(
  rows: T[],
  scoringMode: CompetitionScoringMode,
  qualification: LeaderboardQualificationFilter,
  poolPredictionCounts: Record<string, number>,
  userIdOf: (row: T) => string
): T[] {
  if (!leaderboardShowsQualificationFilter(scoringMode) || qualification === 'all') {
    return rows
  }
  return rows.filter((r) => (poolPredictionCounts[userIdOf(r)] ?? 0) >= 3)
}

/** Visible global leaderboard filter controls by scoring mode. */
export function globalLeaderboardFilterControls(
  scoringMode: CompetitionScoringMode
): Array<'season' | 'all' | 'qualification' | 'sort'> {
  if (leaderboardShowsQualificationFilter(scoringMode)) {
    return ['season', 'qualification', 'sort']
  }
  return ['season', 'all', 'sort']
}
