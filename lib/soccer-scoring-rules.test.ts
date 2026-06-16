import { describe, expect, it } from 'vitest'
import {
  SOCCER_SCORING_LEADERBOARD_NOTE,
  SOCCER_SCORING_RULES,
} from './soccer-scoring-rules'

describe('soccer scoring rules copy', () => {
  it('lists all four point tiers in order', () => {
    expect(SOCCER_SCORING_RULES.map((r) => r.points)).toEqual([3, 2, 1, 0])
  })

  it('includes examples for exact score and wrong result', () => {
    expect(SOCCER_SCORING_RULES[0].example).toContain('2-1')
    expect(SOCCER_SCORING_RULES[3].example).toContain('3-0')
  })

  it('mentions one correct team score for 1 point', () => {
    expect(SOCCER_SCORING_RULES[2].description).toMatch(/one correct team score/i)
  })

  it('includes the leaderboard update note', () => {
    expect(SOCCER_SCORING_LEADERBOARD_NOTE).toMatch(/completed fixtures are scored/i)
  })
})
