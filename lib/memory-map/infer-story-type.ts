import type { StoryType } from '@/lib/memory-map/types'

export function inferStoryType(hasVideo: boolean, hasPhoto: boolean, hasText: boolean): StoryType {
  if (hasVideo && (hasPhoto || hasText)) return 'mixed'
  if (hasVideo) return 'video'
  if (hasPhoto && hasText) return 'mixed'
  if (hasPhoto) return 'photo'
  return 'text'
}
