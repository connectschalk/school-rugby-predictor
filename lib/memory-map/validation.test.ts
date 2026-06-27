import { describe, expect, it } from 'vitest'
import {
  MM_MAX_PHOTOS_PER_STORY,
  deriveStoryTitle,
  getQuickMemoryFieldErrors,
  slugify,
  validateImageFile,
  validateQuickMemorySubmit,
  validateStoryContent,
  validateVideoFile,
  validateQuickContributorSubmit,
} from './validation'

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('  Boishaai High School  ')).toBe('boishaai-high-school')
    expect(slugify('Test__Map!!!')).toBe('test-map')
  })
})

describe('validateImageFile', () => {
  it('accepts allowed image types within size limit', () => {
    expect(validateImageFile(file('a.jpg', 'image/jpeg', 1024)).ok).toBe(true)
  })

  it('rejects wrong type and oversized files', () => {
    expect(validateImageFile(file('a.gif', 'image/gif', 1024)).ok).toBe(false)
    expect(validateImageFile(file('a.jpg', 'image/jpeg', 9 * 1024 * 1024)).ok).toBe(false)
  })
})

describe('validateVideoFile', () => {
  it('warns on large videos', () => {
    const result = validateVideoFile(file('big.mp4', 'video/mp4', 90 * 1024 * 1024))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warning).toContain('longer')
  })
})

describe('validateStoryContent', () => {
  const base = {
    title: 'Title',
    description: 'Description',
    year: '2020',
    categoryId: 'cat-1',
    riskLevel: 'low',
    photoCount: 0,
    hasVideo: false,
    hasText: true,
    permissionConfirmed: true,
  }

  it('requires title and permission', () => {
    expect(validateStoryContent({ ...base, title: '' })).toContain('title')
    expect(validateStoryContent({ ...base, permissionConfirmed: false })).toContain('permission')
  })

  it('enforces photo limit', () => {
    expect(
      validateStoryContent({ ...base, photoCount: MM_MAX_PHOTOS_PER_STORY + 1 })
    ).toContain(String(MM_MAX_PHOTOS_PER_STORY))
  })
})

describe('deriveStoryTitle', () => {
  it('uses first line of description up to 80 chars', () => {
    expect(deriveStoryTitle('Winning the derby\nMore details')).toBe('Winning the derby')
    expect(deriveStoryTitle('x'.repeat(90))).toBe(`${'x'.repeat(77)}…`)
  })

  it('falls back to Memory when empty', () => {
    expect(deriveStoryTitle('')).toBe('Memory')
    expect(deriveStoryTitle('   \n')).toBe('Memory')
  })
})

describe('validateQuickMemorySubmit (legacy shim)', () => {
  const base = {
    description: 'Scored the winning try',
    extraText: '',
    year: '2024',
    photoCount: 0,
    hasVideo: false,
    permissionConfirmed: true,
    displayName: 'Alex',
  }

  it('maps permissionConfirmed to submission policy', () => {
    expect(validateQuickMemorySubmit({ ...base, permissionConfirmed: false })).toContain('contributor terms')
    expect(validateQuickMemorySubmit({ ...base, photoCount: 1 })).toBeNull()
  })
})

describe('validateQuickContributorSubmit', () => {
  it('defaults review level path via low risk in submit flow', () => {
    expect(
      validateQuickContributorSubmit({
        memoryTitle: 'Match day',
        shortNote: '',
        textMemory: '',
        year: '2024',
        photoCount: 2,
        hasVideo: false,
        hasSubmissionPolicy: true,
        displayName: 'Sam',
      })
    ).toBeNull()
  })
})

describe('getQuickMemoryFieldErrors', () => {
  it('returns friendly field-level messages', () => {
    const errors = getQuickMemoryFieldErrors({
      description: '',
      extraText: '',
      year: '',
      photoCount: 0,
      hasVideo: false,
      permissionConfirmed: false,
      displayName: '',
    })
    expect(errors.content).toContain('photo')
    expect(errors.year).toContain('year')
    expect(errors.permission).toContain('contributor terms')
  })
})
