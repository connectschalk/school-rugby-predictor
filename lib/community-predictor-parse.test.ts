import { describe, expect, it } from 'vitest'
import {
  isCommunityStatsRpcFailure,
  parseCommunityStatsRpc,
} from './community-predictor'

describe('parseCommunityStatsRpc', () => {
  it('parses rugby margin stats with zero predictions', () => {
    const data = parseCommunityStatsRpc({
      allowed: true,
      scoring_mode: 'rugby_margin',
      match_id: 'm1',
      home_team: 'Home',
      away_team: 'Away',
      kickoff_time: '2026-06-06T12:00:00Z',
      status: 'completed',
      home_score: 10,
      away_score: 5,
      actual_winner: 'home',
      actual_margin: 5,
      total_predictions: 0,
      home_prediction_count: 0,
      away_prediction_count: 0,
      home_prediction_pct: 0,
      away_prediction_pct: 0,
      bucket_rows: [],
      community_average_label: null,
    })
    expect(data.allowed).toBe(true)
    if (data.allowed) {
      expect(data.scoring_mode).toBe('rugby_margin')
      expect(data.total_predictions).toBe(0)
      if (data.scoring_mode === 'rugby_margin') {
        expect(data.bucket_rows).toEqual([])
      }
    }
  })

  it('parses soccer stats without bucket_rows', () => {
    const data = parseCommunityStatsRpc({
      allowed: true,
      scoring_mode: 'soccer_exact_score',
      match_id: 'm2',
      home_team: 'Netherlands',
      away_team: 'Japan',
      kickoff_time: '2026-06-06T12:00:00Z',
      status: 'completed',
      total_predictions: 2,
      home_prediction_count: 1,
      away_prediction_count: 1,
      draw_prediction_count: 0,
      home_prediction_pct: 50,
      away_prediction_pct: 50,
      draw_prediction_pct: 0,
      top_scorelines: [{ home_score: 1, away_score: 2, count: 1, percentage: 50, label: '1-2' }],
      community_average_label: '1.0 - 1.5',
    })
    expect(data.allowed).toBe(true)
    if (data.allowed && data.scoring_mode === 'soccer_exact_score') {
      expect(data.top_scorelines).toHaveLength(1)
      expect('bucket_rows' in data).toBe(false)
    }
  })

  it('defaults missing scoring_mode to rugby_margin', () => {
    const data = parseCommunityStatsRpc({
      allowed: true,
      match_id: 'm3',
      home_team: 'A',
      away_team: 'B',
      kickoff_time: '2026-01-01T12:00:00Z',
      status: 'completed',
      total_predictions: 0,
      bucket_rows: null,
    })
    expect(data.allowed).toBe(true)
    if (data.allowed) expect(data.scoring_mode).toBe('rugby_margin')
  })
})

describe('isCommunityStatsRpcFailure', () => {
  it('treats postgres errors as rpc failures', () => {
    expect(
      isCommunityStatsRpcFailure({ allowed: false, reason: 'column scoring_mode does not exist' })
    ).toBe(true)
  })

  it('does not treat lock_required as rpc failure', () => {
    expect(isCommunityStatsRpcFailure({ allowed: false, reason: 'lock_required' })).toBe(false)
  })
})
