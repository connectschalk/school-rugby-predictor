import { describe, expect, it } from 'vitest'
import { parseValidCommunityDateFilter } from './community-predictor'

describe('parseValidCommunityDateFilter', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(parseValidCommunityDateFilter('2026-08-02')).toBe('2026-08-02')
  })

  it('rejects empty, slash placeholders, and invalid calendars', () => {
    expect(parseValidCommunityDateFilter('')).toBeNull()
    expect(parseValidCommunityDateFilter('yyyy/mm/dd')).toBeNull()
    expect(parseValidCommunityDateFilter('2026/08/02')).toBeNull()
    expect(parseValidCommunityDateFilter('2026-13-01')).toBeNull()
    expect(parseValidCommunityDateFilter('2026-02-31')).toBeNull()
  })
})
