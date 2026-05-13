export type OneMatchChallengeRow = {
  id: string
  match_id: string
  slug: string
  created_by: string | null
  is_active: boolean
  created_at: string
}

export type OneMatchPredictionRow = {
  id: string
  challenge_id: string
  display_name: string
  predicted_winner: 'home' | 'away'
  predicted_margin: number
  browser_token: string
  ip_hash: string | null
  is_locked: boolean
  created_at: string
  updated_at: string
}

export type OneMatchMatchRow = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
}

export function browserTokenStorageKey(slug: string): string {
  return `one_match_bt_${slug}`
}

export function getOrCreateBrowserToken(slug: string): string {
  if (typeof window === 'undefined') return ''
  const key = browserTokenStorageKey(slug)
  let t = (window.localStorage.getItem(key) ?? '').trim()
  if (t.length >= 16) return t
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    t = crypto.randomUUID()
  } else {
    t = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
  window.localStorage.setItem(key, t)
  return t
}

export function actualWinnerFromScores(
  homeScore: number | null,
  awayScore: number | null
): 'home' | 'away' | null {
  if (homeScore == null || awayScore == null) return null
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return null
}

/** Point margin for the winning side (positive when `winner` won). */
export function actualPointMargin(
  homeScore: number,
  awayScore: number,
  winner: 'home' | 'away'
): number {
  return winner === 'home' ? homeScore - awayScore : awayScore - homeScore
}

export type RankedPrediction = OneMatchPredictionRow & {
  rank: number
  correct: boolean
  marginError: number | null
}

/** Medal bands follow the first three distinct margin-error tiers among correct picks (same as rank bands). */
export type ResultsMedalTier = 'gold' | 'silver' | 'bronze' | null

/** Sorted distinct |predicted − actual| among correct predictions (ascending). */
export function distinctMarginErrorsForMedals(ranked: RankedPrediction[]): number[] {
  const errs = ranked
    .filter((r) => r.correct && r.marginError != null)
    .map((r) => r.marginError as number)
  return [...new Set(errs)].sort((a, b) => a - b)
}

export function medalTierForMarginError(
  marginError: number | null,
  correct: boolean,
  orderedDistinctErrors: number[]
): ResultsMedalTier {
  if (!correct || marginError == null || orderedDistinctErrors.length === 0) return null
  const i = orderedDistinctErrors.indexOf(marginError)
  if (i === 0) return 'gold'
  if (i === 1) return 'silver'
  if (i === 2) return 'bronze'
  return null
}

/**
 * Correct winner first; among correct, closest predicted margin to actual point margin wins.
 * Same margin error → same rank (competition style). Wrong picks share one trailing rank after corrects.
 */
export function rankPredictionsForResults(
  predictions: OneMatchPredictionRow[],
  actualWinner: 'home' | 'away',
  actualMargin: number
): RankedPrediction[] {
  const correct = predictions
    .filter((p) => p.predicted_winner === actualWinner)
    .sort((a, b) => {
      const ae = Math.abs(a.predicted_margin - actualMargin)
      const be = Math.abs(b.predicted_margin - actualMargin)
      if (ae !== be) return ae - be
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  const wrong = predictions
    .filter((p) => p.predicted_winner !== actualWinner)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const sorted = [...correct, ...wrong]

  let rank = 0
  let prevErr: number | null | undefined = undefined
  let wrongRankAssigned = false

  return sorted.map((p) => {
    const isCorrect = p.predicted_winner === actualWinner
    const marginError = isCorrect ? Math.abs(p.predicted_margin - actualMargin) : null
    if (isCorrect) {
      if (marginError !== prevErr) {
        rank += 1
        prevErr = marginError
      }
    } else if (!wrongRankAssigned) {
      rank += 1
      wrongRankAssigned = true
    }
    return { ...p, rank, correct: isCorrect, marginError }
  })
}
