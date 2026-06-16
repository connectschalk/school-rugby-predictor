import {
  resolveCompetitionScoringMode,
  SCHOOLS_COMPETITION_SLUG,
  type CompetitionScoringMode,
} from './competitions'
import { SOCCER_EXACT_SCORE_POINTS } from './soccer-exact-score-scoring'
import type {
  GameMatch,
  MyPredictionOverviewRow,
  UserPredictionRow,
} from './public-prediction-game'

export type MyPredictionsSummaryStats = {
  total: number
  scoredCompleted: number
  correct: number
  accuracyPct: number | null
  totalPoints: number
  exactMargins: number
  exactScores: number
}

export type MyPredictionsCompetitionBreakdown = MyPredictionsSummaryStats & {
  competitionId: string
  slug: string
  name: string
  scoringMode: CompetitionScoringMode
}

export function matchBelongsToCompetition(
  matchCompetitionId: string | null | undefined,
  filter: { competitionId: string; slug: string }
): boolean {
  if (filter.slug === SCHOOLS_COMPETITION_SLUG) {
    return matchCompetitionId == null || matchCompetitionId === filter.competitionId
  }
  return matchCompetitionId === filter.competitionId
}

export function rowScoringMode(row: MyPredictionOverviewRow): CompetitionScoringMode {
  if (row.competition) {
    return resolveCompetitionScoringMode(row.competition.slug, row.competition.scoring_mode)
  }
  return 'rugby_margin'
}

export function isSoccerRow(row: MyPredictionOverviewRow): boolean {
  return rowScoringMode(row) === 'soccer_exact_score'
}

export function computeMyPredictionsStats(rows: MyPredictionOverviewRow[]): MyPredictionsSummaryStats {
  const usable = rows.filter((r) => r.match.status !== 'cancelled')
  const completed = usable.filter((r) => r.match.status === 'completed')
  const scored = completed.filter((r) => r.score !== null)

  let correct = 0
  let exactMargins = 0
  let exactScores = 0
  let totalPoints = 0

  for (const row of scored) {
    const score = row.score!
    totalPoints += score.total_points ?? 0
    if (isSoccerRow(row)) {
      if (score.total_points === SOCCER_EXACT_SCORE_POINTS) exactScores += 1
      if (score.winner_correct) correct += 1
    } else {
      if (score.winner_correct) correct += 1
      if (
        score.winner_correct &&
        score.margin_difference !== null &&
        score.margin_difference === 0
      ) {
        exactMargins += 1
      }
    }
  }

  return {
    total: usable.length,
    scoredCompleted: scored.length,
    correct,
    accuracyPct: scored.length ? Math.round((correct / scored.length) * 1000) / 10 : null,
    totalPoints,
    exactMargins,
    exactScores,
  }
}

export function computeMyPredictionsBreakdown(
  rows: MyPredictionOverviewRow[]
): MyPredictionsCompetitionBreakdown[] {
  const byKey = new Map<string, MyPredictionOverviewRow[]>()

  for (const row of rows) {
    const key = row.competition?.id ?? 'unknown'
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const breakdown: MyPredictionsCompetitionBreakdown[] = []
  for (const [, group] of byKey) {
    const first = group[0]
    const competition = first.competition
    if (!competition) continue
    const stats = computeMyPredictionsStats(group)
    breakdown.push({
      ...stats,
      competitionId: competition.id,
      slug: competition.slug,
      name: competition.name,
      scoringMode: resolveCompetitionScoringMode(competition.slug, competition.scoring_mode),
    })
  }

  return breakdown.sort((a, b) => a.name.localeCompare(b.name))
}

export function splitMyPredictionRows(rows: MyPredictionOverviewRow[]) {
  const usable = rows.filter((r) => r.match.status !== 'cancelled')
  const upcoming = usable
    .filter((r) => r.match.status === 'upcoming' || r.match.status === 'locked')
    .sort((a, b) => new Date(a.match.kickoff_time).getTime() - new Date(b.match.kickoff_time).getTime())
  const completed = usable
    .filter((r) => r.match.status === 'completed')
    .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime())
  return { upcoming, completed }
}

export function rugbyWinnerLabel(pred: UserPredictionRow, match: GameMatch): string {
  return pred.predicted_winner === 'home' ? match.home_team : match.away_team
}

export function formatRugbyPrediction(pred: UserPredictionRow, match: GameMatch): string {
  const margin = pred.predicted_margin ?? 0
  return `${rugbyWinnerLabel(pred, match)} by ${margin} pts`
}

export function formatSoccerPrediction(pred: UserPredictionRow, match: GameMatch): string {
  const home = pred.predicted_home_score ?? 0
  const away = pred.predicted_away_score ?? 0
  return `${match.home_team} ${home} - ${away} ${match.away_team}`
}

export function formatPredictionPick(row: MyPredictionOverviewRow): string {
  if (isSoccerRow(row)) {
    return formatSoccerPrediction(row.prediction, row.match)
  }
  return formatRugbyPrediction(row.prediction, row.match)
}

export type CompletedPredictionBadge = {
  label: string
  className: string
}

export function completedPredictionBadge(row: MyPredictionOverviewRow): CompletedPredictionBadge {
  const { score } = row
  if (!score) {
    return {
      label: 'Not scored yet',
      className: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600',
    }
  }

  if (isSoccerRow(row)) {
    if (score.total_points === SOCCER_EXACT_SCORE_POINTS) {
      return {
        label: 'Exact score',
        className:
          'rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950 ring-2 ring-amber-300',
      }
    }
    if (score.total_points === 2) {
      return {
        label: 'Close score',
        className: 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900',
      }
    }
    if (score.total_points === 1) {
      return {
        label: 'Correct result',
        className: 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900',
      }
    }
    return {
      label: 'Wrong pick',
      className: 'rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800',
    }
  }

  const exact =
    score.winner_correct && score.margin_difference !== null && score.margin_difference === 0
  if (exact) {
    return {
      label: 'Exact margin',
      className:
        'rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950 ring-2 ring-amber-300',
    }
  }
  if (score.winner_correct) {
    return {
      label: 'Correct winner',
      className: 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900',
    }
  }
  return {
    label: 'Wrong pick',
    className: 'rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800',
  }
}

export function predictHrefForRow(row: MyPredictionOverviewRow, focusMatchId?: string): string {
  const slug = row.competition?.slug ?? SCHOOLS_COMPETITION_SLUG
  const base = `/competitions/${slug}/predict`
  if (focusMatchId) {
    return `${base}?focus=${encodeURIComponent(focusMatchId)}`
  }
  return base
}
