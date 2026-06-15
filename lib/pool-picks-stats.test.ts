import { describe, expect, it } from 'vitest'
import { buildPoolCommunityStatsOk } from './pool-picks-stats'

const match = {
  id: 'm1',
  home_team: 'Spain',
  away_team: 'Cape Verde',
  kickoff_time: '2026-06-15T16:00:00.000Z',
  status: 'upcoming' as const,
  home_score: null,
  away_score: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('buildPoolCommunityStatsOk soccer', () => {
  it('counts exact-score pool picks and builds top scoreline', () => {
    const stats = buildPoolCommunityStatsOk(
      match,
      [
        {
          user_id: 'u1',
          predicted_winner: null,
          predicted_margin: null,
          predicted_home_score: 3,
          predicted_away_score: 0,
          reveal_allowed: true,
          is_viewer: true,
        },
        {
          user_id: 'u2',
          predicted_winner: null,
          predicted_margin: null,
          predicted_home_score: 2,
          predicted_away_score: 1,
          reveal_allowed: true,
          is_viewer: false,
        },
      ],
      'soccer_exact_score'
    )

    expect(stats.scoring_mode).toBe('soccer_exact_score')
    if (stats.scoring_mode !== 'soccer_exact_score') return
    expect(stats.total_predictions).toBe(2)
    expect(stats.home_prediction_count).toBe(2)
    expect(stats.home_prediction_pct).toBe(100)
    expect(stats.top_scorelines[0]).toMatchObject({ home_score: 3, away_score: 0, count: 1 })
    expect(stats.user_locked_home_score).toBe(3)
    expect(stats.user_locked_away_score).toBe(0)
  })

  it('ignores soccer rows when rugby mode', () => {
    const stats = buildPoolCommunityStatsOk(
      match,
      [
        {
          user_id: 'u1',
          predicted_winner: null,
          predicted_margin: null,
          predicted_home_score: 3,
          predicted_away_score: 0,
          reveal_allowed: true,
          is_viewer: false,
        },
      ],
      'rugby_margin'
    )

    expect(stats.scoring_mode).toBe('rugby_margin')
    expect(stats.total_predictions).toBe(0)
  })
})
