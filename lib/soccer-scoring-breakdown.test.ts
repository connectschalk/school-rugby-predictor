import { describe, expect, it } from 'vitest'
import {
  buildSoccerBreakdownSummaryText,
  computeSoccerBreakdownStats,
  soccerOutcomeLabelFromPoints,
} from './soccer-scoring-breakdown'

describe('soccerOutcomeLabelFromPoints', () => {
  it('maps persisted soccer point totals to outcome labels', () => {
    expect(soccerOutcomeLabelFromPoints(3)).toBe('Exact score')
    expect(soccerOutcomeLabelFromPoints(2)).toBe('Close score')
    expect(soccerOutcomeLabelFromPoints(1)).toBe('Correct result')
    expect(soccerOutcomeLabelFromPoints(0)).toBe('Wrong result')
  })
})

describe('computeSoccerBreakdownStats', () => {
  it('aggregates from persisted total_points and winner_correct', () => {
    const stats = computeSoccerBreakdownStats([
      { total_points: 3, winner_correct: true },
      { total_points: 2, winner_correct: true },
      { total_points: 1, winner_correct: true },
      { total_points: 0, winner_correct: false },
    ])
    expect(stats).toEqual({
      totalPoints: 6,
      exactScores: 1,
      correctResults: 3,
      picksScored: 4,
      wrongResults: 1,
    })
  })
})

describe('buildSoccerBreakdownSummaryText', () => {
  it('builds plain-English summary from persisted scores', () => {
    const scores = [
      { total_points: 3, winner_correct: true },
      { total_points: 2, winner_correct: true },
      { total_points: 2, winner_correct: true },
      { total_points: 0, winner_correct: false },
    ]
    const stats = computeSoccerBreakdownStats(scores)
    expect(buildSoccerBreakdownSummaryText('Alex', stats, scores)).toBe(
      'Alex has 7 points from 4 scored picks: 1 exact score, 2 correct results, and 1 wrong result.'
    )
  })
})
