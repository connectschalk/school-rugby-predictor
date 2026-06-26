import type { SupabaseClient } from '@supabase/supabase-js'

export const MM_BUCKET_BRANDING = 'memory-map-branding'
export const MM_BUCKET_BACKGROUNDS = 'memory-map-backgrounds'
export const MM_BUCKET_SPONSORS = 'memory-map-sponsors'
export const MM_BUCKET_STORY_MEDIA = 'memory-map-story-media'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export const MM_MAX_PROFILE_BYTES = 5 * 1024 * 1024
export const MM_MAX_BACKGROUND_BYTES = 10 * 1024 * 1024
export const MM_MAX_SPONSOR_BYTES = 5 * 1024 * 1024
export const MM_MAX_PHOTO_BYTES = 8 * 1024 * 1024
export const MM_MAX_VIDEO_BYTES = 250 * 1024 * 1024

function publicUrl(client: SupabaseClient, bucket: string, path: string): string {
  const { data } = client.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadMemoryMapImage(
  client: SupabaseClient,
  bucket: string,
  mapId: string,
  folder: string,
  file: File,
  maxBytes: number
): Promise<{ url: string; path: string } | { error: string }> {
  const mime = file.type.toLowerCase()
  if (!IMAGE_TYPES.has(mime)) return { error: 'Use JPG, PNG, or WebP.' }
  if (file.size > maxBytes) return { error: `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` }

  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `${folder}/${mapId}/${Date.now()}.${ext}`
  const { error } = await client.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: mime,
    cacheControl: '3600',
  })
  if (error) return { error: error.message }
  return { url: publicUrl(client, bucket, path), path }
}

export async function uploadPendingStoryMedia(
  client: SupabaseClient,
  mapId: string,
  file: File,
  sortOrder: number
): Promise<
  | { media_type: 'video' | 'image'; file_url: string; file_name: string; file_size: number; mime_type: string; sort_order: number }
  | { error: string }
> {
  const mime = file.type.toLowerCase()
  const isVideo = VIDEO_TYPES.has(mime)
  const isImage = IMAGE_TYPES.has(mime)
  if (!isVideo && !isImage) return { error: 'Use JPG, PNG, WebP, MP4, MOV, or WebM.' }
  const max = isVideo ? MM_MAX_VIDEO_BYTES : MM_MAX_PHOTO_BYTES
  if (file.size > max) return { error: `File too large (max ${Math.round(max / 1024 / 1024)} MB).` }

  const folder = isVideo ? 'videos' : 'photos'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg')
  const path = `${folder}/${mapId}/pending/${Date.now()}-${sortOrder}.${ext}`
  const { error } = await client.storage.from(MM_BUCKET_STORY_MEDIA).upload(path, file, {
    contentType: mime,
    cacheControl: '3600',
  })
  if (error) return { error: error.message }

  return {
    media_type: isVideo ? 'video' : 'image',
    file_url: publicUrl(client, MM_BUCKET_STORY_MEDIA, path),
    file_name: file.name,
    file_size: file.size,
    mime_type: mime,
    sort_order: sortOrder,
  }
}

export async function uploadStoryMediaFile(
  client: SupabaseClient,
  mapId: string,
  storyId: string,
  file: File,
  sortOrder: number
): Promise<
  | { media_type: 'video' | 'image'; file_url: string; file_name: string; file_size: number; mime_type: string; sort_order: number }
  | { error: string }
> {
  const mime = file.type.toLowerCase()
  const isVideo = VIDEO_TYPES.has(mime)
  const isImage = IMAGE_TYPES.has(mime)
  if (!isVideo && !isImage) return { error: 'Use JPG, PNG, WebP, MP4, MOV, or WebM.' }
  const max = isVideo ? MM_MAX_VIDEO_BYTES : MM_MAX_PHOTO_BYTES
  if (file.size > max) return { error: `File too large (max ${Math.round(max / 1024 / 1024)} MB).` }

  const folder = isVideo ? 'videos' : 'photos'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? (isVideo ? 'mp4' : 'jpg')
  const path = `${folder}/${mapId}/${storyId}/${sortOrder}-${Date.now()}.${ext}`
  const { error } = await client.storage.from(MM_BUCKET_STORY_MEDIA).upload(path, file, {
    contentType: mime,
    cacheControl: '3600',
  })
  if (error) return { error: error.message }

  return {
    media_type: isVideo ? 'video' : 'image',
    file_url: publicUrl(client, MM_BUCKET_STORY_MEDIA, path),
    file_name: file.name,
    file_size: file.size,
    mime_type: mime,
    sort_order: sortOrder,
  }
}
