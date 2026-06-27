import { MM_MAX_PHOTOS_PER_STORY } from '@/lib/memory-map/validation'
import type { AdminPublishOption } from '@/lib/memory-map/official-content'

export type AdminStoryDraftInput = {
  title: string
  description: string
  year: string
  categoryId: string | null
  riskLevel: string
  photoCount: number
  hasVideo: boolean
  hasText: boolean
  selectedAreaId: string
  selectedPinId: string | null
  creatingNewPin: boolean
  newPinTitle: string
  hasPinPlacement: boolean
}

export function validateAdminStoryDraft(input: AdminStoryDraftInput): string | null {
  if (!input.selectedAreaId) return 'Choose an area before continuing.'
  if (!input.title.trim()) return 'Give this memory a short name.'
  const hasMedia = input.photoCount > 0 || input.hasVideo
  const hasText = Boolean(input.description.trim() || input.hasText)
  if (!hasMedia && !hasText) return 'Add a photo, video or text memory.'
  if (!input.year || Number.isNaN(parseInt(input.year, 10))) return 'Add the year this happened.'
  if (input.photoCount > MM_MAX_PHOTOS_PER_STORY) {
    return `Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`
  }
  if (input.creatingNewPin) {
    if (!input.newPinTitle.trim()) return 'Name this place before adding your memory.'
    if (!input.hasPinPlacement) return 'Tap the map where this memory happened.'
  } else if (!input.selectedPinId) {
    return 'Select an existing pin or create a new one.'
  }
  return null
}

export function validateAdminPublishOption(option: string): option is AdminPublishOption {
  return option === 'approved' || option === 'draft' || option === 'pending_review'
}
