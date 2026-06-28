import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPoolLogoStoragePath,
  POOL_LOGO_BUCKET,
  validatePoolLogoFile,
} from '@/lib/pool-logo'
import type { PoolRow } from '@/lib/pools'
import { normalizePoolInviteJoinMode } from '@/lib/pool-invite-join-mode'

function cacheBustPublicUrl(path: string, publicUrl: string): string {
  return `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(path)}`
}

export async function uploadPoolLogoFile(
  client: SupabaseClient,
  poolId: string,
  file: File
): Promise<{ logoPath: string; logoUrl: string } | { error: string }> {
  const validationError = validatePoolLogoFile(file)
  if (validationError) return { error: validationError }

  const path = buildPoolLogoStoragePath(poolId, file)
  const { error: uploadError } = await client.storage.from(POOL_LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const { data } = client.storage.from(POOL_LOGO_BUCKET).getPublicUrl(path)
  const publicUrl = data?.publicUrl
  if (!publicUrl) {
    return { error: 'Could not resolve public URL.' }
  }

  return {
    logoPath: path,
    logoUrl: cacheBustPublicUrl(path, publicUrl),
  }
}

export async function savePoolLogo(
  client: SupabaseClient,
  poolId: string,
  logoUrl: string,
  logoPath: string
): Promise<{ pool: PoolRow | null; error: string | null }> {
  const { data, error } = await client.rpc('update_pool_logo', {
    p_pool_id: poolId,
    p_logo_url: logoUrl,
    p_logo_path: logoPath,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('forbidden')) {
      return { pool: null, error: 'Only pool admins can update the pool logo.' }
    }
    return { pool: null, error: error.message }
  }

  if (!data) return { pool: null, error: 'Could not save pool logo.' }
  return { pool: normalizePoolLogoRow(data as Record<string, unknown>), error: null }
}

export function normalizePoolLogoRow(data: Record<string, unknown>): PoolRow {
  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    admin_user_id: String(data.admin_user_id ?? ''),
    created_by: String(data.created_by ?? ''),
    is_public: Boolean(data.is_public),
    invite_token: String(data.invite_token ?? '').trim(),
    join_code: String(data.join_code ?? '').trim().toLowerCase(),
    invite_join_mode: normalizePoolInviteJoinMode(data.invite_join_mode),
    is_closed: Boolean(data.is_closed),
    competition_id: data.competition_id != null ? String(data.competition_id) : null,
    logo_url: data.logo_url == null ? null : String(data.logo_url),
    logo_path: data.logo_path == null ? null : String(data.logo_path),
    logo_updated_at: data.logo_updated_at == null ? null : String(data.logo_updated_at),
    created_at: String(data.created_at ?? ''),
    updated_at: String(data.updated_at ?? ''),
  }
}
