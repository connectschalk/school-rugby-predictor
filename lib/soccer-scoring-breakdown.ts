import type { SupabaseClient } from '@supabase/supabase-js'
import { SCHOOLS_COMPETITION_SLUG } from './competitions'
import { SOCCER_EXACT_SCORE_POINTS } from './soccer-exact-score-scoring'
import type { UserPredictionRow, UserPredictionScoreRow } from './public-prediction-game'

export type SoccerScoringBreakdownRow = {
  matchId: string
  matchLabel: string
  predictionLabel: string
  actualLabel: string
  points: number
  outcomeLabel: string
  kickoffTime: string
}

export type SoccerScoringBreakdownStats = {
  totalPoints: number
  exactScores: number
  correctResults: number
  picksScored: number
  wrongResults: number
}

export type SoccerScoringBreakdownResult = {
  rows: SoccerScoringBreakdownRow[]
  stats: SoccerScoringBreakdownStats
  summaryText: string
}

export type FetchSoccerScoringBreakdownOptions = {
  userId: string
  competitionId: string
  competitionSlug: string
  displayName: string
  season?: number
  poolMatchIds?: string[]
  poolJoinedAt?: string | null
}

export function soccerOutcomeLabelFromPoints(totalPoints: number): string {
  if (totalPoints === SOCCER_EXACT_SCORE_POINTS) return 'Exact score'
  if (totalPoints === 2) return 'Close score'
  if (totalPoints === 1) return 'Correct result'
  return 'Wrong result'
}

function scoreline(home: number, away: number): string {
  return `${home}-${away}`
}

function matchBelongsToCompetition(
  matchCompetitionId: string | null | undefined,
  competitionId: string,
  competitionSlug: string
): boolean {
  if (competitionSlug === SCHOOLS_COMPETITION_SLUG) {
    return matchCompetitionId == null || matchCompetitionId === competitionId
  }
  return matchCompetitionId === competitionId
}

function kickoffSeason(kickoffTime: string): number {
  return new Date(kickoffTime).getFullYear()
}

export function computeSoccerBreakdownStats(
  scores: Pick<UserPredictionScoreRow, 'total_points' | 'winner_correct'>[]
): SoccerScoringBreakdownStats {
  const picksScored = scores.length
  const totalPoints = scores.reduce((sum, s) => sum + (s.total_points ?? 0), 0)
  const exactScores = scores.filter((s) => s.total_points === SOCCER_EXACT_SCORE_POINTS).length
  const correctResults = scores.filter((s) => s.winner_correct).length
  const wrongResults = scores.filter((s) => s.total_points === 0).length
  return { totalPoints, exactScores, correctResults, picksScored, wrongResults }
}

function joinSummaryParts(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

export function buildSoccerBreakdownSummaryText(
  displayName: string,
  stats: SoccerScoringBreakdownStats,
  scores: Pick<UserPredictionScoreRow, 'total_points' | 'winner_correct'>[]
): string {
  const correctNonExact = scores.filter(
    (s) => s.winner_correct && s.total_points !== SOCCER_EXACT_SCORE_POINTS
  ).length

  const parts: string[] = []
  if (stats.exactScores > 0) {
    parts.push(`${stats.exactScores} exact score${stats.exactScores === 1 ? '' : 's'}`)
  }
  if (correctNonExact > 0) {
    parts.push(`${correctNonExact} correct result${correctNonExact === 1 ? '' : 's'}`)
  }
  if (stats.wrongResults > 0) {
    parts.push(`${stats.wrongResults} wrong result${stats.wrongResults === 1 ? '' : 's'}`)
  }

  const detail = parts.length > 0 ? `: ${joinSummaryParts(parts)}` : ''
  return `${displayName} has ${stats.totalPoints} points from ${stats.picksScored} scored pick${stats.picksScored === 1 ? '' : 's'}${detail}.`
}

type BreakdownMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  home_score: number | null
  away_score: number | null
  competition_id: string | null
  status: string
}

function toBreakdownRow(
  match: BreakdownMatch,
  prediction: Pick<UserPredictionRow, 'predicted_home_score' | 'predicted_away_score'>,
  score: UserPredictionScoreRow
): SoccerScoringBreakdownRow | null {
  if (
    prediction.predicted_home_score == null ||
    prediction.predicted_away_score == null ||
    match.home_score == null ||
    match.away_score == null
  ) {
    return null
  }

  const predHome = Math.trunc(prediction.predicted_home_score)
  const predAway = Math.trunc(prediction.predicted_away_score)
  const actualHome = Math.trunc(match.home_score)
  const actualAway = Math.trunc(match.away_score)
  const points = score.total_points ?? 0

  return {
    matchId: match.id,
    matchLabel: `${match.home_team} ${scoreline(predHome, predAway)} ${match.away_team}`,
    predictionLabel: scoreline(predHome, predAway),
    actualLabel: scoreline(actualHome, actualAway),
    points,
    outcomeLabel: soccerOutcomeLabelFromPoints(points),
    kickoffTime: match.kickoff_time,
  }
}

/**
 * Fetches one user's scored soccer picks for a competition season and optional pool scope.
 * Points come from persisted `user_prediction_scores.total_points` (not recalculated).
 */
export async function fetchSoccerScoringBreakdown(
  client: SupabaseClient,
  options: FetchSoccerScoringBreakdownOptions
): Promise<{ data: SoccerScoringBreakdownResult | null; error: Error | null }> {
  const { userId, competitionId, competitionSlug, displayName, season, poolMatchIds, poolJoinedAt } =
    options

  let scopedMatchIds: string[]

  if (poolMatchIds?.length) {
    scopedMatchIds = [...new Set(poolMatchIds)]
  } else {
    const { data: matchRows, error: matchErr } = await client
      .from('game_matches')
      .select('id, competition_id, kickoff_time, status')
      .eq('status', 'completed')

    if (matchErr) {
      return { data: null, error: new Error(matchErr.message) }
    }

    scopedMatchIds = ((matchRows as { id: string; competition_id: string | null; kickoff_time: string }[]) ?? [])
      .filter((m) => matchBelongsToCompetition(m.competition_id, competitionId, competitionSlug))
      .filter((m) => (season == null ? true : kickoffSeason(m.kickoff_time) === season))
      .map((m) => m.id)
  }

  if (scopedMatchIds.length === 0) {
    const emptyStats = computeSoccerBreakdownStats([])
    return {
      data: {
        rows: [],
        stats: emptyStats,
        summaryText: buildSoccerBreakdownSummaryText(displayName, emptyStats, []),
      },
      error: null,
    }
  }

  const { data: scores, error: scoreErr } = await client
    .from('user_prediction_scores')
    .select(
      'id, prediction_id, match_id, user_id, winner_correct, total_points, scored_at, margin_difference, winner_points, margin_points, actual_winner, actual_margin'
    )
    .eq('user_id', userId)
    .in('match_id', scopedMatchIds)

  if (scoreErr) {
    return { data: null, error: new Error(scoreErr.message) }
  }

  const scoreRows = ((scores as UserPredictionScoreRow[]) ?? []).filter((s) => {
    if (!poolJoinedAt) return true
    return new Date(s.scored_at) >= new Date(poolJoinedAt)
  })

  if (scoreRows.length === 0) {
    const emptyStats = computeSoccerBreakdownStats([])
    return {
      data: {
        rows: [],
        stats: emptyStats,
        summaryText: buildSoccerBreakdownSummaryText(displayName, emptyStats, []),
      },
      error: null,
    }
  }

  const predictionIds = scoreRows.map((s) => s.prediction_id)
  const matchIds = [...new Set(scoreRows.map((s) => s.match_id))]

  const [{ data: predictions, error: predErr }, { data: matches, error: matchDetailErr }] =
    await Promise.all([
      client
        .from('user_predictions')
        .select('id, predicted_home_score, predicted_away_score')
        .in('id', predictionIds),
      client
        .from('game_matches')
        .select('id, home_team, away_team, kickoff_time, home_score, away_score, competition_id, status')
        .in('id', matchIds),
    ])

  if (predErr) return { data: null, error: new Error(predErr.message) }
  if (matchDetailErr) return { data: null, error: new Error(matchDetailErr.message) }

  const predById = new Map(
    ((predictions as UserPredictionRow[]) ?? []).map((p) => [p.id, p])
  )
  const matchById = new Map(((matches as BreakdownMatch[]) ?? []).map((m) => [m.id, m]))

  const breakdownRows: SoccerScoringBreakdownRow[] = []
  const statsScores: UserPredictionScoreRow[] = []

  for (const score of scoreRows) {
    const prediction = predById.get(score.prediction_id)
    const match = matchById.get(score.match_id)
    if (!prediction || !match) continue
    if (!matchBelongsToCompetition(match.competition_id, competitionId, competitionSlug)) continue
    if (season != null && !poolMatchIds?.length && kickoffSeason(match.kickoff_time) !== season) continue
    if (match.status !== 'completed') continue

    const row = toBreakdownRow(match, prediction, score)
    if (!row) continue
    breakdownRows.push(row)
    statsScores.push(score)
  }

  breakdownRows.sort((a, b) => +new Date(b.kickoffTime) - +new Date(a.kickoffTime))

  const stats = computeSoccerBreakdownStats(statsScores)
  return {
    data: {
      rows: breakdownRows,
      stats,
      summaryText: buildSoccerBreakdownSummaryText(displayName, stats, statsScores),
    },
    error: null,
  }
}
