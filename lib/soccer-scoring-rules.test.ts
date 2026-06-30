import { describe, expect, it } from 'vitest'
import {
  SOCCER_PENALTY_KNOCKOUT_NOTE,
  SOCCER_SCORING_LEADERBOARD_NOTE,
  SOCCER_SCORING_RULES,
  SOCCER_SCORING_TOOLTIP_SUMMARY,
} from './soccer-scoring-rules'

describe('soccer scoring rules copy', () => {
  it('lists all four point tiers in order', () => {
    expect(SOCCER_SCORING_RULES.map((r) => r.points)).toEqual([3, 2, 1, 0])
  })

  it('explains exact draw score plus correct penalty winner for 3 points', () => {
    const exact = SOCCER_SCORING_RULES[0]
    expect(exact.penaltyNote).toMatch(/exact draw score and the correct penalty winner/i)
    expect(exact.examples?.some((e) => e.includes('Morocco on penalties'))).toBe(true)
    expect(exact.examples?.some((e) => e.includes('2–1'))).toBe(true)
  })

  it('explains 2 points for correct advancing team without exact score', () => {
    const twoPoints = SOCCER_SCORING_RULES[1]
    expect(twoPoints.title).toMatch(/advancing team/i)
    expect(twoPoints.examples?.some((e) => e.includes('Legacy prediction'))).toBe(true)
  })

  it('explains partly correct 1-point cases including wrong penalty winner', () => {
    const onePoint = SOCCER_SCORING_RULES[2]
    expect(onePoint.title).toMatch(/Partly correct/i)
    expect(onePoint.examples?.some((e) => e.includes('Netherlands on penalties'))).toBe(true)
  })

  it('includes wrong-result penalty example', () => {
    expect(SOCCER_SCORING_RULES[3].examples?.[0]).toMatch(/winning on penalties/i)
  })

  it('includes knockout penalty pick note and leaderboard note', () => {
    expect(SOCCER_PENALTY_KNOCKOUT_NOTE).toMatch(/choose who wins on penalties/i)
    expect(SOCCER_SCORING_LEADERBOARD_NOTE).toMatch(/completed fixtures are scored/i)
  })

  it('summarises penalty-aware scoring in tooltip copy', () => {
    expect(SOCCER_SCORING_TOOLTIP_SUMMARY).toMatch(/penalty winner/i)
  })
})
