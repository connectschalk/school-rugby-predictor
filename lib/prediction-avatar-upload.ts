import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'prediction-avatars'
const MAX_BYTES = 2 * 1024 * 1024

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Upload avatar to `prediction-avatars/{userId}/avatar.{ext}` (upsert).
 * Caller must ensure user is authenticated; storage RLS enforces folder = uid.
 */
export async function uploadPredictionAvatar(
  client: SupabaseClient,
  userId: string,
  file: File
): Promise<{ publicUrl: string | null; error: Error | null }> {
  if (!ALLOWED.has(file.type)) {
    return {
      publicUrl: null,
      error: new Error('Use a PNG, JPEG, or WebP image.'),
    }
  }
  if (file.size > MAX_BYTES) {
    return { publicUrl: null, error: new Error('Image must be 2 MB or smaller.') }
  }

  const ext = extForMime(file.type)
  const path = `${userId}/avatar.${ext}`

  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })

  if (uploadError) {
    return { publicUrl: null, error: new Error(uploadError.message) }
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = data?.publicUrl
    ? `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
    : null

  if (!publicUrl) {
    return { publicUrl: null, error: new Error('Could not resolve public URL.') }
  }

  return { publicUrl, error: null }
}
