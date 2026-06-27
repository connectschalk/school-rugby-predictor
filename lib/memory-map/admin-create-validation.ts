import { MM_MAX_PHOTOS_PER_STORY } from '@/lib/memory-map/validation'
import type { AdminPublishOption } from '@/lib/memory-map/official-content'

export type AdminStoryDraftInput = {
  title: string
  description: string
  year: string
  categoryId: string
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
  if (!input.categoryId) return 'Category is required.'
  if (!input.title.trim()) return 'Story title is required.'
  if (!input.description.trim() && !input.hasText && input.photoCount === 0 && !input.hasVideo) {
    return 'Add a description, photo, or video.'
  }
  if (!input.year || Number.isNaN(parseInt(input.year, 10))) return 'Year happened is required.'
  if (!input.riskLevel) return 'Review level is required.'
  if (input.photoCount > MM_MAX_PHOTOS_PER_STORY) {
    return `Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`
  }
  if (input.creatingNewPin) {
    if (!input.newPinTitle.trim()) return 'Enter a pin title or select an existing pin.'
    if (!input.hasPinPlacement) return 'Place the pin on the map.'
  } else if (!input.selectedPinId) {
    return 'Select an existing pin or create a new one.'
  }
  return null
}

export function validateAdminPublishOption(option: string): option is AdminPublishOption {
  return option === 'approved' || option === 'draft' || option === 'pending_review'
}
