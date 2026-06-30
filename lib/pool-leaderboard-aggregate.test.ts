import { describe, expect, it } from 'vitest'
import { scoreSoccerPrediction } from '@/lib/soccer-exact-score-scoring'
import {
  aggregatePoolLeaderboard,
  isScoreInPoolScope,
} from '@/lib/pool-leaderboard-aggregate'
import {
  soccerPredictionWinnerCorrect,
  soccerScoringReasonLabel,
} from '@/lib/soccer-penalty-scoring-parity'

const MEMBERS = [
  { user_id: 'u1', joined_at: '2026-06-01T00:00:00.000Z' },
  { user_id: 'u2', joined_at: '2026-06-10T00:00:00.000Z' },
]

const MATCHES = ['m1', 'm2', 'm3']

describe('aggregatePoolLeaderboard', () => {
  it('sums totals, correct winners, games, and average margin for pool scope', () => {
    const scores = [
      {
        user_id: 'u1',
        match_id: 'm1',
        prediction_id: 'p1',
        total_points: 3,
        margin_difference: 0,
        winner_correct: true,
        margin_points: 0,
        scored_at: '2026-06-05T12:00:00.000Z',
      },
      {
        user_id: 'u1',
        match_id: 'm2',
        prediction_id: 'p2',
        total_points: 2,
        margin_difference: 1,
        winner_correct: true,
        margin_points: 0,
        scored_at: '2026-06-08T12:00:00.000Z',
      },
      {
        user_id: 'u2',
        match_id: 'm1',
        prediction_id: 'p3',
        total_points: 0,
        margin_difference: 4,
        winner_correct: false,
        margin_points: 0,
        scored_at: '2026-06-05T12:00:00.000Z',
      },
      {
        user_id: 'u2',
        match_id: 'm2',
        prediction_id: 'p4',
        total_points: 3,
        margin_difference: 0,
        winner_correct: true,
        margin_points: 0,
        scored_at: '2026-06-11T12:00:00.000Z',
      },
    ]

    const rows = aggregatePoolLeaderboard(MEMBERS, MATCHES, scores)
    const u1 = rows.find((r) => r.user_id === 'u1')!
    const u2 = rows.find((r) => r.user_id === 'u2')!

    expect(u1).toEqual({
      user_id: 'u1',
      total_points: 5,
      total_margin_difference: 1,
      average_margin_difference: 0.5,
      games_predicted: 2,
      correct_winners: 2,
      margin_points_total: 0,
    })

    expect(u2).toEqual({
      user_id: 'u2',
      total_points: 3,
      total_margin_difference: 0,
      average_margin_difference: 0,
      games_predicted: 1,
      correct_winners: 1,
      margin_points_total: 0,
    })
  })

  it('excludes scores outside effective match ids', () => {
    const scores = [
      {
        user_id: 'u1',
        match_id: 'outside',
        prediction_id: 'p9',
        total_points: 99,
        margin_difference: 0,
        winner_correct: true,
        margin_points: 0,
        scored_at: '2026-06-05T12:00:00.000Z',
      },
    ]
    const rows = aggregatePoolLeaderboard(MEMBERS, MATCHES, scores)
    expect(rows.find((r) => r.user_id === 'u1')?.total_points).toBe(0)
  })
})

describe('isScoreInPoolScope', () => {
  it('requires effective match and scored_at after join', () => {
    const member = { joined_at: '2026-06-10T00:00:00.000Z' }
    expect(
      isScoreInPoolScope(
        { match_id: 'm1', scored_at: '2026-06-11T00:00:00.000Z' },
        member,
        MATCHES
      )
    ).toBe(true)
    expect(
      isScoreInPoolScope(
        { match_id: 'm1', scored_at: '2026-06-09T00:00:00.000Z' },
        member,
        MATCHES
      )
    ).toBe(false)
    expect(
      isScoreInPoolScope(
        { match_id: 'other', scored_at: '2026-06-11T00:00:00.000Z' },
        member,
        MATCHES
      )
    ).toBe(false)
  })
})

describe('pool penalty shootout scoring parity', () => {
  const awayPens = { home_score: 1, away_score: 1, penalty_winner: 'away' as const }

  it('penalty exact draw scores 3 points and counts as correct winner', () => {
    const pred = {
      predicted_home_score: 1,
      predicted_away_score: 1,
      predicted_penalty_winner: 'away' as const,
    }
    const score = scoreSoccerPrediction(1, 1, 1, 1, {
      predictedPenaltyWinner: 'away',
      actualPenaltyWinner: 'away',
    })
    expect(score.points).toBe(3)
    expect(soccerPredictionWinnerCorrect(pred, awayPens)).toBe(true)
    expect(soccerScoringReasonLabel(pred, awayPens)).toBe(
      'Exact draw score and correct penalty winner'
    )
  })

  it('legacy 1–1 without penalty pick scores 2 but is not a correct winner', () => {
    const pred = {
      predicted_home_score: 1,
      predicted_away_score: 1,
      predicted_penalty_winner: null,
    }
    expect(scoreSoccerPrediction(1, 1, 1, 1, { actualPenaltyWinner: 'away' }).points).toBe(2)
    expect(soccerPredictionWinnerCorrect(pred, awayPens)).toBe(false)
    expect(soccerScoringReasonLabel(pred, awayPens)).toBe(
      'Exact draw scoreline (legacy prediction without penalty pick)'
    )
  })

  it('exact draw with wrong penalty winner scores 1', () => {
    const pred = {
      predicted_home_score: 1,
      predicted_away_score: 1,
      predicted_penalty_winner: 'home' as const,
    }
    expect(
      scoreSoccerPrediction(1, 1, 1, 1, {
        predictedPenaltyWinner: 'home',
        actualPenaltyWinner: 'away',
      }).points
    ).toBe(1)
    expect(soccerScoringReasonLabel(pred, awayPens)).toBe(
      'Exact draw score but wrong penalty winner'
    )
  })
})
