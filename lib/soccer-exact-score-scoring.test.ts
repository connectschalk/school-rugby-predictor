import { describe, expect, it } from 'vitest'
import { scoreSoccerPrediction } from './soccer-exact-score-scoring'

const pens = { actualPenaltyWinner: 'home' as const }

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

  it('handles draws without penalties', () => {
    expect(scoreSoccerPrediction(0, 0, 0, 0)).toEqual({ points: 3, outcome: 'exact' })
    expect(scoreSoccerPrediction(1, 1, 2, 2)).toEqual({ points: 2, outcome: 'close' })
    expect(scoreSoccerPrediction(2, 2, 0, 0)).toEqual({ points: 1, outcome: 'correct' })
    expect(scoreSoccerPrediction(1, 1, 2, 1)).toEqual({ points: 0, outcome: 'wrong' })
  })
})

describe('scoreSoccerPrediction penalty shootout', () => {
  it('1. actual 2–1, user 2–1 = 3', () => {
    expect(scoreSoccerPrediction(2, 1, 2, 1)).toEqual({ points: 3, outcome: 'exact' })
  })

  it('2. actual 2–1, user 1–0 same winner = 2', () => {
    expect(scoreSoccerPrediction(1, 0, 2, 1)).toEqual({ points: 2, outcome: 'close' })
  })

  it('3. actual 2–1, user 2–0 one team score = close (2) under existing rules', () => {
    expect(scoreSoccerPrediction(2, 0, 2, 1)).toEqual({ points: 2, outcome: 'close' })
  })

  it('4. actual 1–1 home wins pens, user 1–1 home pens = 3', () => {
    expect(
      scoreSoccerPrediction(1, 1, 1, 1, { ...pens, predictedPenaltyWinner: 'home' })
    ).toEqual({ points: 3, outcome: 'exact' })
  })

  it('5. actual 1–1 home wins pens, user 1–1 away pens = not 3', () => {
    const result = scoreSoccerPrediction(1, 1, 1, 1, { ...pens, predictedPenaltyWinner: 'away' })
    expect(result.points).not.toBe(3)
    expect(result).toEqual({ points: 1, outcome: 'correct' })
  })

  it('6. actual 1–1 home wins pens, user 2–2 home pens = 2', () => {
    expect(
      scoreSoccerPrediction(2, 2, 1, 1, { ...pens, predictedPenaltyWinner: 'home' })
    ).toEqual({ points: 2, outcome: 'close' })
  })

  it('7. actual 1–1 home wins pens, legacy user 1–1 with no penalty winner = 2', () => {
    expect(scoreSoccerPrediction(1, 1, 1, 1, pens)).toEqual({ points: 2, outcome: 'close' })
  })

  it('8. actual 1–1 home wins pens, legacy user winner/home correct but score not exact = 2', () => {
    expect(
      scoreSoccerPrediction(2, 1, 1, 1, { ...pens, legacyPredictedWinner: 'home' })
    ).toEqual({ points: 2, outcome: 'close' })
  })
})
