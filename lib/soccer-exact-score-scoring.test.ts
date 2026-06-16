import { describe, expect, it } from 'vitest'
import { scoreSoccerPrediction } from './soccer-exact-score-scoring'

describe('scoreSoccerPrediction', () => {
  it('awards 3 points for an exact scoreline', () => {
    expect(scoreSoccerPrediction(2, 1, 2, 1)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(1, 1, 1, 1)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(0, 2, 0, 2)).toEqual({ points: 3, outcome: 'exact' })
  })

  it('awards 2 points for correct result + close score', () => {
    expect(scoreSoccerPrediction(2, 1, 3, 2)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(1, 1, 2, 2)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(2, 1, 2, 0)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(0, 1, 0, 2)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(1, 3, 0, 2)).toEqual({ points: 2, outcome: 'close' })
  })

  it('awards 1 point for correct result only', () => {
    expect(scoreSoccerPrediction(3, 1, 1, 0)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(2, 2, 0, 0)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(0, 3, 0, 1)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(2, 2, 1, 1)).toEqual({ points: 2, outcome: 'close' })
  })

  it('awards 0 points for a wrong result', () => {
    expect(scoreSoccerPrediction(3, 0, 2, 2)).toEqual({ points: 0, outcome: 'wrong' })
    expect(scoreSoccerPrediction(1, 1, 2, 1)).toEqual({ points: 0, outcome: 'wrong' })
    expect(scoreSoccerPrediction(2, 1, 1, 1)).toEqual({ points: 0, outcome: 'wrong' })
    expect(scoreSoccerPrediction(0, 2, 2, 0)).toEqual({ points: 0, outcome: 'wrong' })
  })

  it('handles home wins', () => {
    expect(scoreSoccerPrediction(3, 0, 3, 0)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(2, 0, 3, 1)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(4, 0, 1, 0)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(2, 0, 1, 2)).toEqual({ points: 0, outcome: 'wrong' })
  })

  it('handles away wins', () => {
    expect(scoreSoccerPrediction(0, 3, 0, 3)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(1, 2, 0, 3)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(0, 4, 0, 1)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(1, 2, 2, 1)).toEqual({ points: 0, outcome: 'wrong' })
  })

  it('handles draws', () => {
    expect(scoreSoccerPrediction(0, 0, 0, 0)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(1, 1, 2, 2)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(2, 2, 0, 0)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(1, 1, 2, 1)).toEqual({ points: 0, outcome: 'wrong' })
  })
})
