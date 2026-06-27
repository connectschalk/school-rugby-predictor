import { describe, expect, it } from 'vitest'
import { validateAdminStoryDraft } from './admin-create-validation'
import { inferStoryType } from './infer-story-type'
import { isAdminCreatedStory, isOfficialStory, publishOptionLabel } from './official-content'
import type { MemoryStory } from './types'

describe('inferStoryType', () => {
  it('detects video, photo, text and mixed', () => {
    expect(inferStoryType(true, false, false)).toBe('video')
    expect(inferStoryType(false, true, false)).toBe('photo')
    expect(inferStoryType(false, false, true)).toBe('text')
    expect(inferStoryType(true, true, false)).toBe('mixed')
  })
})

describe('official-content helpers', () => {
  it('reads official and admin-created flags', () => {
    const story = {
      is_official: true,
      governance_flags: { admin_created: true },
    } as MemoryStory
    expect(isOfficialStory(story)).toBe(true)
    expect(isAdminCreatedStory(story)).toBe(true)
    expect(publishOptionLabel('draft')).toBe('Save as draft')
  })
})

describe('validateAdminStoryDraft', () => {
  it('requires pin placement for new pins', () => {
    const err = validateAdminStoryDraft({
      title: 'Title',
      description: 'Desc',
      year: '2020',
      categoryId: 'cat-1',
      riskLevel: 'low',
      photoCount: 0,
      hasVideo: false,
      hasText: true,
      selectedAreaId: 'area-1',
      selectedPinId: null,
      creatingNewPin: true,
      newPinTitle: 'New pin',
      hasPinPlacement: false,
    })
    expect(err).toMatch(/place the pin/i)
  })
})
