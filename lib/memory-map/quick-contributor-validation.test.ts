import { describe, expect, it } from 'vitest'
import { defaultCategoryId } from './validation'
import {
  resolveMemoryTitle,
  validateQuickContributorSubmit,
  getQuickContributorFieldErrors,
} from './validation'

describe('validateQuickContributorSubmit', () => {
  const base = {
    memoryTitle: 'Derby day',
    shortNote: '',
    textMemory: '',
    year: '2024',
    photoCount: 1,
    hasVideo: false,
    hasSubmissionPolicy: true,
    displayName: 'Alex',
  }

  it('accepts media-only memory with title and year', () => {
    expect(validateQuickContributorSubmit(base)).toBeNull()
  })

  it('accepts text-only memory', () => {
    expect(
      validateQuickContributorSubmit({
        ...base,
        photoCount: 0,
        textMemory: 'We won the hostel war cry competition.',
      })
    ).toBeNull()
  })

  it('does not require per-upload permission when policy accepted', () => {
    expect(
      validateQuickContributorSubmit({
        ...base,
        hasSubmissionPolicy: true,
      })
    ).toBeNull()
    expect(
      validateQuickContributorSubmit({
        ...base,
        hasSubmissionPolicy: false,
      })
    ).toContain('contributor terms')
  })

  it('rejects missing content', () => {
    expect(
      validateQuickContributorSubmit({
        ...base,
        photoCount: 0,
        hasVideo: false,
        textMemory: '',
        shortNote: '',
      })
    ).toContain('photo')
  })

  it('rejects missing year', () => {
    expect(validateQuickContributorSubmit({ ...base, year: '' })).toContain('year')
  })
})

describe('resolveMemoryTitle', () => {
  it('auto-generates from year when title blank', () => {
    expect(resolveMemoryTitle('', '', '', '2019')).toBe('Memory 2019')
  })

  it('uses explicit title when provided', () => {
    expect(resolveMemoryTitle('Final whistle', '', '', '2020')).toBe('Final whistle')
  })
})

describe('defaultCategoryId', () => {
  it('prefers General category', () => {
    expect(
      defaultCategoryId([
        { id: 'c1', name: 'Sport', is_active: true },
        { id: 'c2', name: 'General', is_active: true },
      ])
    ).toBe('c2')
  })

  it('falls back to first active category', () => {
    expect(defaultCategoryId([{ id: 'c1', name: 'Sport', is_active: true }])).toBe('c1')
  })
})

describe('getQuickContributorFieldErrors', () => {
  it('does not include permission field for story form', () => {
    const errors = getQuickContributorFieldErrors({
      memoryTitle: '',
      shortNote: '',
      textMemory: '',
      year: '',
      photoCount: 0,
      hasVideo: false,
      hasSubmissionPolicy: false,
      displayName: '',
    })
    expect(errors.policy).toContain('contributor terms')
    expect('permission' in errors).toBe(false)
  })
})
