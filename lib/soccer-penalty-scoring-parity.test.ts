import { describe, expect, it } from 'vitest'
import { scoreSoccerPrediction } from '@/lib/soccer-exact-score-scoring'
import {
  soccerPredictionWinnerCorrect,
  soccerScoredActualWinner,
} from '@/lib/soccer-penalty-scoring-parity'

const awayPens = { home_score: 1, away_score: 1, penalty_winner: 'away' as const }
const homePens = { home_score: 1, away_score: 1, penalty_winner: 'home' as const }

describe('soccer penalty admin scoring parity', () => {
  it('1–2. penalty draw actual_winner is the advancing team, not draw', () => {
    expect(soccerScoredActualWinner(awayPens)).toBe('away')
    expect(soccerScoredActualWinner(homePens)).toBe('home')
  })

  it('4. exact 1–1 + correct penalty winner scores 3 and winner_correct', () => {
    const pred = {
      predicted_home_score: 1,
      predicted_away_score: 1,
      predicted_penalty_winner: 'away' as const,
    }
    expect(
      scoreSoccerPrediction(1, 1, 1, 1, {
        predictedPenaltyWinner: 'away',
        actualPenaltyWinner: 'away',
      })
    ).toEqual({ points: 3, outcome: 'exact' })
    expect(soccerPredictionWinnerCorrect(pred, awayPens)).toBe(true)
  })

  it('5. legacy 1–1 without predicted_penalty_winner scores 2 and winner_correct is false', () => {
    const pred = {
      predicted_home_score: 1,
      predicted_away_score: 1,
      predicted_penalty_winner: null,
    }
    expect(scoreSoccerPrediction(1, 1, 1, 1, { actualPenaltyWinner: 'away' })).toEqual({
      points: 2,
      outcome: 'close',
    })
    expect(soccerPredictionWinnerCorrect(pred, awayPens)).toBe(false)
  })

  it('6. 2–2 + correct penalty winner scores 2 and winner_correct', () => {
    const pred = {
      predicted_home_score: 2,
      predicted_away_score: 2,
      predicted_penalty_winner: 'home' as const,
    }
    expect(
      scoreSoccerPrediction(2, 2, 1, 1, {
        predictedPenaltyWinner: 'home',
        actualPenaltyWinner: 'home',
      })
    ).toEqual({ points: 2, outcome: 'close' })
    expect(soccerPredictionWinnerCorrect(pred, homePens)).toBe(true)
  })

  it('7. wrong penalty winner does not score 3', () => {
    expect(
      scoreSoccerPrediction(1, 1, 1, 1, {
        predictedPenaltyWinner: 'home',
        actualPenaltyWinner: 'away',
      }).points
    ).not.toBe(3)
  })

  it('8. non-draw result still scores normally', () => {
    expect(scoreSoccerPrediction(2, 1, 2, 1)).toEqual({ points: 3, outcome: 'exact' })
    expect(
      soccerPredictionWinnerCorrect(
        { predicted_home_score: 2, predicted_away_score: 1 },
        { home_score: 2, away_score: 1 }
      )
    ).toBe(true)
  })

  it('9. group-stage draw without penalty_winner uses draw actual_winner', () => {
    expect(soccerScoredActualWinner({ home_score: 1, away_score: 1, penalty_winner: null })).toBe(
      'draw'
    )
    expect(
      soccerPredictionWinnerCorrect(
        { predicted_home_score: 1, predicted_away_score: 1 },
        { home_score: 1, away_score: 1, penalty_winner: null }
      )
    ).toBe(true)
  })

  it('10. legacy predicted_winner matching penalty winner is winner_correct', () => {
    expect(
      soccerPredictionWinnerCorrect(
        {
          predicted_home_score: 2,
          predicted_away_score: 1,
          predicted_penalty_winner: null,
          predicted_winner: 'away',
        },
        awayPens
      )
    ).toBe(true)
  })

  it('Germany / Netherlands style penalty draws: legacy 1–1 never yields null winner_correct', () => {
    for (const penaltyWinner of ['away', 'home'] as const) {
      const actual = { home_score: 1, away_score: 1, penalty_winner: penaltyWinner }
      const legacy = {
        predicted_home_score: 1,
        predicted_away_score: 1,
        predicted_penalty_winner: null,
        predicted_winner: null,
      }
      const result = soccerPredictionWinnerCorrect(legacy, actual)
      expect(result).toBe(false)
      expect(typeof result).toBe('boolean')
    }
  })

  it('exact 1–1 with correct penalty winner is winner_correct', () => {
    expect(
      soccerPredictionWinnerCorrect(
        {
          predicted_home_score: 1,
          predicted_away_score: 1,
          predicted_penalty_winner: 'away',
        },
        { home_score: 1, away_score: 1, penalty_winner: 'away' }
      )
    ).toBe(true)
  })
})
