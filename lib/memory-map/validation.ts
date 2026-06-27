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

export function resolveMemoryTitle(
  memoryTitle: string,
  shortNote: string,
  textMemory: string,
  year: string
): string {
  if (memoryTitle.trim()) return memoryTitle.trim()
  const fromText = shortNote.trim() || textMemory.trim()
  if (fromText) return deriveStoryTitle(fromText)
  const y = year.trim() || String(new Date().getFullYear())
  return `Memory ${y}`
}

export type QuickContributorSubmitInput = {
  memoryTitle: string
  shortNote: string
  textMemory: string
  year: string
  photoCount: number
  hasVideo: boolean
  hasSubmissionPolicy: boolean
  displayName: string
}

export type QuickContributorFieldErrors = {
  content?: string
  year?: string
  title?: string
  note?: string
  name?: string
  policy?: string
}

export function getQuickContributorFieldErrors(input: QuickContributorSubmitInput): QuickContributorFieldErrors {
  const errors: QuickContributorFieldErrors = {}
  const hasMedia = input.photoCount > 0 || input.hasVideo
  const hasText = Boolean(input.shortNote.trim() || input.textMemory.trim())

  if (!hasMedia && !hasText) {
    errors.content = 'Add a photo, video or text memory.'
  }
  if (!hasMedia && !input.shortNote.trim() && !input.textMemory.trim()) {
    errors.note = 'Write the memory.'
  }
  if (!input.year || Number.isNaN(parseInt(input.year, 10))) {
    errors.year = 'Add the year this happened.'
  }
  if (!resolveMemoryTitle(input.memoryTitle, input.shortNote, input.textMemory, input.year).trim()) {
    errors.title = 'Give this memory a short name.'
  }
  if (!input.hasSubmissionPolicy) {
    errors.policy = 'Please accept the contributor terms before submitting memories.'
  }
  if (!input.displayName.trim()) {
    errors.name = 'Enter your name.'
  }
  return errors
}

export function validateQuickContributorSubmit(input: QuickContributorSubmitInput): string | null {
  const errors = getQuickContributorFieldErrors(input)
  const hasMedia = input.photoCount > 0 || input.hasVideo
  const hasText = Boolean(input.shortNote.trim() || input.textMemory.trim())

  if (!hasMedia && !hasText) {
    return errors.content ?? 'Add a photo, video or text memory.'
  }
  if (!hasMedia && !input.shortNote.trim() && !input.textMemory.trim()) {
    return errors.note ?? 'Write the memory.'
  }
  if (errors.year) return errors.year
  if (errors.policy) return errors.policy
  if (errors.name) return errors.name
  if (input.photoCount > MM_MAX_PHOTOS_PER_STORY) {
    return `Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`
  }
  return null
}

/** @deprecated Use validateQuickContributorSubmit */
export type QuickMemoryInput = {
  description: string
  extraText: string
  year: string
  photoCount: number
  hasVideo: boolean
  permissionConfirmed: boolean
  displayName: string
}

/** @deprecated Use getQuickContributorFieldErrors */
export type QuickMemoryFieldErrors = QuickContributorFieldErrors & {
  description?: string
  permission?: string
}

/** @deprecated Use validateQuickContributorSubmit */
export function validateQuickMemorySubmit(input: QuickMemoryInput): string | null {
  return validateQuickContributorSubmit({
    memoryTitle: '',
    shortNote: input.description,
    textMemory: input.extraText,
    year: input.year,
    photoCount: input.photoCount,
    hasVideo: input.hasVideo,
    hasSubmissionPolicy: input.permissionConfirmed,
    displayName: input.displayName,
  })
}

/** @deprecated Use getQuickContributorFieldErrors */
export function getQuickMemoryFieldErrors(input: QuickMemoryInput): QuickMemoryFieldErrors {
  const errors = getQuickContributorFieldErrors({
    memoryTitle: '',
    shortNote: input.description,
    textMemory: input.extraText,
    year: input.year,
    photoCount: input.photoCount,
    hasVideo: input.hasVideo,
    hasSubmissionPolicy: input.permissionConfirmed,
    displayName: input.displayName,
  })
  return {
    ...errors,
    description: errors.note,
    permission: errors.policy,
  }
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

export function defaultCategoryId(categories: { id: string; name: string; is_active?: boolean }[]): string {
  const active = categories.filter((c) => c.is_active !== false)
  return active.find((c) => c.name.toLowerCase() === 'general')?.id ?? active[0]?.id ?? ''
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
