import { describe, expect, it } from 'vitest'
import {
  cannotApproveOwnStory,
  isOwnStoryPlatformOverride,
  normalizeApprovalError,
  OWN_STORY_APPROVAL_MESSAGE,
} from './own-story-approval'
import type { MemoryStory } from './types'

const contributorStory = {
  uploaded_by: 'user-a',
  governance_flags: {},
} as MemoryStory

const adminCreatedStory = {
  uploaded_by: 'user-a',
  governance_flags: { admin_created: true },
} as MemoryStory

describe('cannotApproveOwnStory', () => {
  it('blocks memory map admin from approving own contributor submission', () => {
    expect(cannotApproveOwnStory(contributorStory, 'user-a', false)).toBe(true)
  })

  it('allows another admin to approve contributor submission', () => {
    expect(cannotApproveOwnStory(contributorStory, 'user-b', false)).toBe(false)
  })

  it('allows platform admin to approve own submission', () => {
    expect(cannotApproveOwnStory(contributorStory, 'user-a', true)).toBe(false)
  })

  it('allows admin to approve own admin-created content saved for review', () => {
    expect(cannotApproveOwnStory(adminCreatedStory, 'user-a', false)).toBe(false)
  })
})

describe('isOwnStoryPlatformOverride', () => {
  it('is true only for platform admin approving own story', () => {
    expect(isOwnStoryPlatformOverride(contributorStory, 'user-a', true)).toBe(true)
    expect(isOwnStoryPlatformOverride(contributorStory, 'user-a', false)).toBe(false)
    expect(isOwnStoryPlatformOverride(contributorStory, 'user-b', true)).toBe(false)
  })
})

describe('normalizeApprovalError', () => {
  it('maps legacy RPC error to friendly copy', () => {
    expect(normalizeApprovalError('cannot approve own story')).toBe(OWN_STORY_APPROVAL_MESSAGE)
  })
})
