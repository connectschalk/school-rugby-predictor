import { describe, expect, it } from 'vitest'
import { REVIEW_LEVEL_OPTIONS, reviewLevelAdminLabel } from './review-level'

describe('reviewLevelAdminLabel', () => {
  it('maps internal values to admin-friendly labels', () => {
    expect(reviewLevelAdminLabel('low')).toBe('Low review')
    expect(reviewLevelAdminLabel('admin_review')).toBe('Admin review')
  })
})

describe('REVIEW_LEVEL_OPTIONS', () => {
  it('keeps database values unchanged', () => {
    expect(REVIEW_LEVEL_OPTIONS.map((o) => o.value)).toEqual(['low', 'medium', 'high', 'admin_review'])
  })
})
