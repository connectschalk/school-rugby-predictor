import type { MemoryStory } from '@/lib/memory-map/types'

export type StoryGovernanceFlagsJson = {
  admin_created?: boolean
  contains_minors?: boolean
  mentions_full_names?: boolean
  shows_injury?: boolean
  is_archive_content?: boolean
  sponsor_or_brand_visible?: boolean
  has_permission_confirmed?: boolean
}

export function parseGovernanceFlags(raw: unknown): StoryGovernanceFlagsJson {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as StoryGovernanceFlagsJson
}

/** Prefer governance_flags JSONB; fall back to legacy direct columns when present. */
export function storyGovernanceBoolean(
  story: MemoryStory,
  key: keyof StoryGovernanceFlagsJson,
  fallback = false
): boolean {
  const flags = parseGovernanceFlags(story.governance_flags)
  if (typeof flags[key] === 'boolean') return flags[key]
  switch (key) {
    case 'contains_minors':
      return story.contains_minors ?? fallback
    case 'mentions_full_names':
      return story.mentions_full_names ?? fallback
    case 'shows_injury':
      return story.shows_injury ?? fallback
    case 'is_archive_content':
      return story.is_archive_content ?? fallback
    case 'sponsor_or_brand_visible':
      return story.sponsor_or_brand_visible ?? fallback
    case 'has_permission_confirmed':
      return story.has_permission_confirmed ?? fallback
    default:
      return fallback
  }
}

export function isAdminCreatedStory(story: Pick<MemoryStory, 'governance_flags'>): boolean {
  return parseGovernanceFlags(story.governance_flags).admin_created === true
}

export function isOfficialStory(story: Pick<MemoryStory, 'is_official'>): boolean {
  return story.is_official === true
}

export function storyStatusLabelForAdmin(status: MemoryStory['status']): string {
  switch (status) {
    case 'approved':
      return 'Published'
    case 'draft':
      return 'Draft'
    case 'pending_review':
      return 'Pending review'
    default:
      return status
  }
}

export type AdminPublishOption = 'approved' | 'draft' | 'pending_review'

export function publishOptionLabel(option: AdminPublishOption): string {
  switch (option) {
    case 'approved':
      return 'Publish now'
    case 'draft':
      return 'Save as draft'
    case 'pending_review':
      return 'Save for review'
  }
}
