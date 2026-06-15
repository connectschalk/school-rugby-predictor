import { describe, expect, it } from 'vitest'
import { scoreSoccerExactPrediction } from './soccer-exact-score-scoring'

describe('scoreSoccerExactPrediction', () => {
  const actual = { homeScore: 1, awayScore: 2 }

  it('awards 4 for exact scoreline', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 1, awayScore: 2 }, actual)).toBe(4)
  })

  it('awards 2 for correct winner and goal difference', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 0, awayScore: 1 }, actual)).toBe(2)
  })

  it('awards 1 for correct winner only', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 0, awayScore: 3 }, actual)).toBe(1)
  })

  it('awards 0 for wrong result', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 2, awayScore: 1 }, actual)).toBe(0)
  })

  it('awards 1 for correct draw with wrong scoreline', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 2, awayScore: 2 }, { homeScore: 1, awayScore: 1 })).toBe(1)
  })

  it('awards 4 for exact draw', () => {
    expect(scoreSoccerExactPrediction({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1 })).toBe(4)
  })
})
