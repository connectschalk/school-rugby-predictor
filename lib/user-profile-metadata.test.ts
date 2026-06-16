import { describe, expect, it } from 'vitest'

/**
 * Mirrors repairUserProfileFromMetadataIfNeeded display_name merge rule.
 * Existing non-empty display_name must never be replaced by metadata/email.
 */
function mergeDisplayName(existing: string | null, metadata: string | null): string {
  const isEmpty = (v: string | null) => v == null || v.trim() === ''
  if (isEmpty(existing) && metadata) return metadata
  return existing ?? metadata ?? 'Player'
}

describe('display_name preservation', () => {
  it('keeps user-chosen display name over metadata/email fallback', () => {
    expect(mergeDisplayName('Predictor', 'connect.schalk')).toBe('Predictor')
  })

  it('uses metadata only when existing display_name is empty', () => {
    expect(mergeDisplayName(null, 'Schalk')).toBe('Schalk')
    expect(mergeDisplayName('  ', 'Schalk')).toBe('Schalk')
  })
})
