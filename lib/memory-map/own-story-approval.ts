import { isAdminCreatedStory } from '@/lib/memory-map/official-content'
import type { MemoryStory } from '@/lib/memory-map/types'

export const OWN_STORY_APPROVAL_MESSAGE =
  'You submitted this memory. Another admin must approve it before it appears publicly.'

export const OWN_STORY_APPROVAL_HELPER =
  'You submitted this memory. Ask another admin to approve it.'

export const PLATFORM_ADMIN_OVERRIDE_NOTE = 'Approving with platform admin override.'

export const PLATFORM_ADMIN_OVERRIDE_LABEL = 'Platform admin override'

export function cannotApproveOwnStory(
  story: Pick<MemoryStory, 'uploaded_by' | 'governance_flags'>,
  currentUserId: string | null | undefined,
  isAppAdmin: boolean
): boolean {
  if (!currentUserId || !story.uploaded_by) return false
  if (isAppAdmin) return false
  if (isAdminCreatedStory(story)) return false
  return story.uploaded_by === currentUserId
}

export function isOwnStoryPlatformOverride(
  story: Pick<MemoryStory, 'uploaded_by'>,
  currentUserId: string | null | undefined,
  isAppAdmin: boolean
): boolean {
  return Boolean(isAppAdmin && currentUserId && story.uploaded_by === currentUserId)
}

export function normalizeApprovalError(message: string | null | undefined): string | null {
  if (!message) return null
  if (message === 'cannot approve own story' || message.includes('cannot approve own story')) {
    return OWN_STORY_APPROVAL_MESSAGE
  }
  return message
}
