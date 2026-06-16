import { describe, expect, it } from 'vitest'
import { SCHOOLS_COMPETITION_SLUG } from './competitions'
import {
  computeMyPredictionsStats,
  formatPredictionPick,
  formatSoccerPrediction,
  formatRugbyPrediction,
  matchBelongsToCompetition,
} from './my-predictions'
import type { MyPredictionOverviewRow } from './public-prediction-game'

function row(
  partial: Partial<MyPredictionOverviewRow> & {
    status: MyPredictionOverviewRow['match']['status']
    scoringSlug?: string
    scoringMode?: 'rugby_margin' | 'soccer_exact_score'
  }
): MyPredictionOverviewRow {
  return {
    prediction: {
      id: 'p1',
      match_id: 'm1',
      user_id: 'u1',
      predicted_winner: partial.scoringMode === 'soccer_exact_score' ? null : 'home',
      predicted_margin: partial.scoringMode === 'soccer_exact_score' ? null : 7,
      predicted_home_score: partial.scoringMode === 'soccer_exact_score' ? 3 : null,
      predicted_away_score: partial.scoringMode === 'soccer_exact_score' ? 0 : null,
      submitted_at: '2026-06-01T12:00:00Z',
    },
    match: {
      id: 'm1',
      home_team: 'Spain',
      away_team: 'Cape Verde',
      kickoff_time: '2026-06-01T18:00:00Z',
      status: partial.status,
      home_score: 3,
      away_score: 0,
      created_at: '2026-06-01T10:00:00Z',
      competition_id: partial.scoringSlug === SCHOOLS_COMPETITION_SLUG ? null : 'c1',
    },
    competition: partial.scoringSlug
      ? {
          id: partial.scoringSlug === SCHOOLS_COMPETITION_SLUG ? 'schools-id' : 'c1',
          slug: partial.scoringSlug,
          name: partial.scoringSlug,
          scoring_mode: partial.scoringMode ?? 'rugby_margin',
        }
      : null,
    score: partial.score ?? null,
  }
}

describe('matchBelongsToCompetition', () => {
  it('includes null competition_id for Schools', () => {
    expect(
      matchBelongsToCompetition(null, {
        competitionId: 'schools-id',
        slug: SCHOOLS_COMPETITION_SLUG,
      })
    ).toBe(true)
  })

  it('excludes null competition_id for non-Schools', () => {
    expect(
      matchBelongsToCompetition(null, {
        competitionId: 'cw-id',
        slug: 'craven-week',
      })
    ).toBe(false)
  })
})

describe('formatPredictionPick', () => {
  it('formats rugby margin picks', () => {
    const r = row({ status: 'upcoming', scoringSlug: 'craven-week' })
    expect(formatRugbyPrediction(r.prediction, r.match)).toBe('Spain by 7 pts')
  })

  it('formats soccer scorelines', () => {
    const r = row({
      status: 'upcoming',
      scoringSlug: 'soccer-world-cup',
      scoringMode: 'soccer_exact_score',
    })
    expect(formatSoccerPrediction(r.prediction, r.match)).toBe('Spain 3 - 0 Cape Verde')
    expect(formatPredictionPick(r)).toBe('Spain 3 - 0 Cape Verde')
  })
})

describe('computeMyPredictionsStats', () => {
  it('counts exact margins for rugby and exact scores for soccer separately', () => {
    const rugby = row({
      status: 'completed',
      scoringSlug: 'craven-week',
      score: {
        id: 's1',
        prediction_id: 'p1',
        match_id: 'm1',
        user_id: 'u1',
        winner_correct: true,
        actual_winner: 'home',
        actual_margin: 7,
        margin_difference: 0,
        winner_points: 1,
        margin_points: 1,
        total_points: 2,
        scored_at: '2026-06-02T00:00:00Z',
      },
    })
    const soccer = row({
      status: 'completed',
      scoringSlug: 'soccer-world-cup',
      scoringMode: 'soccer_exact_score',
      score: {
        id: 's2',
        prediction_id: 'p2',
        match_id: 'm2',
        user_id: 'u1',
        winner_correct: true,
        actual_winner: 'home',
        actual_margin: 3,
        margin_difference: 0,
        winner_points: 0,
        margin_points: 0,
        total_points: 3,
        scored_at: '2026-06-02T00:00:00Z',
      },
    })
    soccer.prediction.id = 'p2'
    soccer.match.id = 'm2'

    const stats = computeMyPredictionsStats([rugby, soccer])
    expect(stats.scoredCompleted).toBe(2)
    expect(stats.exactMargins).toBe(1)
    expect(stats.exactScores).toBe(1)
    expect(stats.totalPoints).toBe(5)
  })
})
