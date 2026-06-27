export const MM_MAX_PHOTOS_PER_STORY = 10
export const MM_MAX_VIDEOS_PER_STORY = 1
export const MM_MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MM_MAX_VIDEO_BYTES = 250 * 1024 * 1024
export const MM_LARGE_VIDEO_BYTES = 80 * 1024 * 1024

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export type MediaValidationResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string }

export function validateImageFile(file: File): MediaValidationResult {
  const mime = file.type.toLowerCase()
  if (!IMAGE_TYPES.has(mime)) {
    return { ok: false, error: `${file.name}: use JPG, PNG, or WebP.` }
  }
  if (file.size > MM_MAX_IMAGE_BYTES) {
    return { ok: false, error: `${file.name}: max ${MM_MAX_IMAGE_BYTES / 1024 / 1024} MB.` }
  }
  return { ok: true }
}

export function validateVideoFile(file: File): MediaValidationResult {
  const mime = file.type.toLowerCase()
  if (!VIDEO_TYPES.has(mime)) {
    return { ok: false, error: `${file.name}: use MP4, MOV, or WebM.` }
  }
  if (file.size > MM_MAX_VIDEO_BYTES) {
    return { ok: false, error: `${file.name}: max ${MM_MAX_VIDEO_BYTES / 1024 / 1024} MB.` }
  }
  if (file.size > MM_LARGE_VIDEO_BYTES) {
    return { ok: true, warning: 'Large videos may take longer to upload.' }
  }
  return { ok: true }
}

export type StoryContentInput = {
  title: string
  description: string
  year: string
  categoryId: string
  riskLevel: string
  photoCount: number
  hasVideo: boolean
  hasText: boolean
  permissionConfirmed: boolean
}

export function deriveStoryTitle(description: string): string {
  const line = description.trim().split('\n')[0]?.trim() ?? ''
  if (!line) return 'Memory'
  return line.length <= 80 ? line : `${line.slice(0, 77)}…`
}

export type QuickMemoryInput = {
  description: string
  extraText: string
  year: string
  photoCount: number
  hasVideo: boolean
  permissionConfirmed: boolean
  displayName: string
}

export type QuickMemoryFieldErrors = {
  content?: string
  year?: string
  description?: string
  permission?: string
  name?: string
}

export function getQuickMemoryFieldErrors(input: QuickMemoryInput): QuickMemoryFieldErrors {
  const errors: QuickMemoryFieldErrors = {}
  const hasMedia = input.photoCount > 0 || input.hasVideo
  const hasWritten = Boolean(input.description.trim() || input.extraText.trim())
  if (!hasMedia && !hasWritten) {
    errors.content = 'Add a photo, video or written memory.'
  }
  if (!input.description.trim()) {
    errors.description = 'Tell us briefly what happened here.'
  }
  if (!input.year || Number.isNaN(parseInt(input.year, 10))) {
    errors.year = 'Add the year this happened.'
  }
  if (!input.permissionConfirmed) {
    errors.permission = 'Please confirm you have permission.'
  }
  if (!input.displayName.trim()) {
    errors.name = 'Enter your name.'
  }
  return errors
}

/** Simplified contributor submit — title/category/risk are derived or defaulted elsewhere. */
export function validateQuickMemorySubmit(input: QuickMemoryInput): string | null {
  const errors = getQuickMemoryFieldErrors(input)
  const first = errors.content ?? errors.description ?? errors.year ?? errors.permission ?? errors.name
  if (input.photoCount > MM_MAX_PHOTOS_PER_STORY) {
    return `Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`
  }
  return first ?? null
}

export function validateStoryContent(input: StoryContentInput): string | null {
  if (!input.title.trim()) return 'Story title is required.'
  if (!input.description.trim() && !input.hasText && input.photoCount === 0 && !input.hasVideo) {
    return 'Add a description, photo, or video.'
  }
  if (!input.year || Number.isNaN(parseInt(input.year, 10))) return 'Year happened is required.'
  if (!input.categoryId) return 'Category is required.'
  if (!input.riskLevel) return 'Review level is required.'
  if (!input.permissionConfirmed) return 'Confirm you have permission to submit.'
  if (input.photoCount > MM_MAX_PHOTOS_PER_STORY) {
    return `Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`
  }
  return null
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
