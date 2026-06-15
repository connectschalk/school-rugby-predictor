import { describe, expect, it } from 'vitest'
import { resolveCompetitionScoringMode } from './competitions'

describe('resolveCompetitionScoringMode', () => {
  it('uses DB value when soccer_exact_score', () => {
    expect(resolveCompetitionScoringMode('nextplay-schools', 'soccer_exact_score')).toBe('soccer_exact_score')
  })

  it('falls back to soccer_exact_score for soccer-world-cup slug', () => {
    expect(resolveCompetitionScoringMode('soccer-world-cup', null)).toBe('soccer_exact_score')
    expect(resolveCompetitionScoringMode('soccer-world-cup', 'rugby_margin')).toBe('soccer_exact_score')
  })

  it('defaults rugby competitions to rugby_margin', () => {
    expect(resolveCompetitionScoringMode('nextplay-schools', null)).toBe('rugby_margin')
    expect(resolveCompetitionScoringMode('craven-week', undefined)).toBe('rugby_margin')
  })
})
