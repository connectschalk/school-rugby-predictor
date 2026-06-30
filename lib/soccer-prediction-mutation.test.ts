import { describe, expect, it } from 'vitest'
import { validateAdminMatchPenaltyResult, validateSoccerPenaltyPrediction } from './soccer-prediction-mutation'

describe('validateSoccerPenaltyPrediction', () => {
  it('9. draw knockout prediction requires penalty winner', () => {
    const result = validateSoccerPenaltyPrediction(1, 1, null, 'Quarter-final')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/penalties/i)
    }
  })

  it('10. non-draw prediction clears predicted_penalty_winner', () => {
    expect(validateSoccerPenaltyPrediction(2, 1, null, 'Quarter-final')).toEqual({
      ok: true,
      penaltyWinner: null,
    })
    const rejected = validateSoccerPenaltyPrediction(2, 1, 'home', 'Quarter-final')
    expect(rejected.ok).toBe(false)
  })

  it('allows group-stage draw without penalty winner', () => {
    expect(validateSoccerPenaltyPrediction(1, 1, null, 'Group A')).toEqual({
      ok: true,
      penaltyWinner: null,
    })
  })

  it('11. admin draw knockout result requires penalty winner', () => {
    const result = validateAdminMatchPenaltyResult(1, 1, null, 'Semi-final')
    expect(result.ok).toBe(false)
  })

  it('12. admin non-draw result clears penalty_winner', () => {
    expect(validateAdminMatchPenaltyResult(2, 1, null, 'Semi-final')).toEqual({
      ok: true,
      penaltyWinner: null,
    })
    expect(validateAdminMatchPenaltyResult(2, 1, 'home', 'Semi-final').ok).toBe(false)
  })
})
