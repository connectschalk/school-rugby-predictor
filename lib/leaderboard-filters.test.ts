import { describe, expect, it } from 'vitest'
import {
  defaultLeaderboardQualificationFilter,
  filterGlobalLeaderboardRows,
  globalLeaderboardFilterControls,
  leaderboardShowsQualificationFilter,
} from './leaderboard-filters'

describe('leaderboardShowsQualificationFilter', () => {
  it('is false for soccer exact-score competitions', () => {
    expect(leaderboardShowsQualificationFilter('soccer_exact_score')).toBe(false)
  })

  it('is true for rugby margin competitions', () => {
    expect(leaderboardShowsQualificationFilter('rugby_margin')).toBe(true)
  })
})

describe('globalLeaderboardFilterControls', () => {
  it('shows season, all, and sort for soccer', () => {
    expect(globalLeaderboardFilterControls('soccer_exact_score')).toEqual(['season', 'all', 'sort'])
  })

  it('includes qualification for rugby', () => {
    expect(globalLeaderboardFilterControls('rugby_margin')).toEqual([
      'season',
      'qualification',
      'sort',
    ])
  })
})

describe('filterGlobalLeaderboardRows', () => {
  const rows = [
    { user_id: 'a', predictions_made: 2 },
    { user_id: 'b', predictions_made: 6 },
  ]

  it('returns all rows for soccer regardless of qualification state', () => {
    expect(
      filterGlobalLeaderboardRows(rows, 'soccer_exact_score', 'qualified')
    ).toHaveLength(2)
  })

  it('filters by qualified threshold for rugby', () => {
    expect(filterGlobalLeaderboardRows(rows, 'rugby_margin', 'qualified')).toEqual([
      { user_id: 'b', predictions_made: 6 },
    ])
  })
})

describe('defaultLeaderboardQualificationFilter', () => {
  it('defaults to all for soccer', () => {
    expect(defaultLeaderboardQualificationFilter('soccer_exact_score')).toBe('all')
  })

  it('defaults to qualified for rugby', () => {
    expect(defaultLeaderboardQualificationFilter('rugby_margin')).toBe('qualified')
  })
})
