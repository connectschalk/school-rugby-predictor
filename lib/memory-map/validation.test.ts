import { describe, expect, it } from 'vitest'
import {
  MM_MAX_PHOTOS_PER_STORY,
  slugify,
  validateImageFile,
  validateStoryContent,
  validateVideoFile,
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
