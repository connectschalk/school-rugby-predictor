import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { isUuid } from '@/lib/pool-invite-path'

/** Invite-safe pool preview (RPC; no private pool data beyond name + inviter display). */
export type PoolInvitePreview = {
  id: string
  name: string
  is_public: boolean
  is_closed: boolean
  competition_id: string | null
  competition_slug: string
  competition_name: string
  competition_logo_url: string | null
  logo_url: string | null
  invite_token: string
  inviter_kind: 'sharer' | 'admin' | 'anonymous'
  inviter_display_name: string | null
  inviter_avatar_url: string | null
  inviter_avatar_letter: string | null
  inviter_avatar_colour: string | null
}

export type PoolInviteViewerState = {
  pool_id: string
  is_member: boolean
  has_pending_request: boolean
}

export function createPoolInviteServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export function parsePoolInviteRow(raw: Record<string, unknown>): PoolInvitePreview {
  const kindRaw = String(raw.inviter_kind ?? 'anonymous')
  const inviter_kind = kindRaw === 'sharer' || kindRaw === 'admin' ? kindRaw : 'anonymous'
  return {
    id: String(raw.pool_id ?? raw.id ?? ''),
    name: String(raw.pool_name ?? raw.name ?? ''),
    is_public: Boolean(raw.is_public),
    is_closed: Boolean(raw.is_closed),
    competition_id: raw.competition_id != null ? String(raw.competition_id) : null,
    competition_slug: String(raw.competition_slug ?? SCHOOLS_COMPETITION_SLUG),
    competition_name: String(raw.competition_name ?? 'NextPlay Schools'),
    competition_logo_url:
      raw.competition_logo_url == null ? null : String(raw.competition_logo_url),
    logo_url:
      raw.pool_logo_url != null
        ? String(raw.pool_logo_url)
        : raw.logo_url == null
          ? null
          : String(raw.logo_url),
    invite_token: String(raw.invite_token ?? ''),
    inviter_kind,
    inviter_display_name: raw.inviter_display_name == null ? null : String(raw.inviter_display_name),
    inviter_avatar_url: raw.inviter_avatar_url == null ? null : String(raw.inviter_avatar_url),
    inviter_avatar_letter:
      raw.inviter_avatar_letter == null ? null : String(raw.inviter_avatar_letter),
    inviter_avatar_colour:
      raw.inviter_avatar_colour == null ? null : String(raw.inviter_avatar_colour),
  }
}

export async function fetchPoolInviteByToken(
  client: SupabaseClient,
  token: string,
  invitedByUserId?: string | null
): Promise<{ pool: PoolInvitePreview | null; error: Error | null }> {
  try {
    const trimmed = token.trim()
    if (!trimmed) {
      return { pool: null, error: null }
    }

    const invited = invitedByUserId && isUuid(invitedByUserId) ? invitedByUserId.trim() : null

    const { data, error } = await client.rpc('get_pool_invite_by_token', {
      p_token: trimmed,
      p_invited_by: invited,
    })

    if (error) return { pool: null, error: new Error(error.message) }

    const rows = (data as Record<string, unknown>[] | null) ?? []
    const raw = rows[0]
    if (!raw) return { pool: null, error: null }
    return { pool: parsePoolInviteRow(raw), error: null }
  } catch (err) {
    return {
      pool: null,
      error: err instanceof Error ? err : new Error('Pool invite lookup failed'),
    }
  }
}

export async function fetchPoolInviteForOg(token: string): Promise<PoolInvitePreview | null> {
  const trimmed = token.trim()
  if (!trimmed) return null

  const client = createPoolInviteServerClient()
  if (!client) {
    console.error('[pool-invite-server] missing Supabase env for OG lookup')
    return null
  }

  const { pool, error } = await fetchPoolInviteByToken(client, trimmed)
  if (error) {
    console.error('[pool-invite-server] invite lookup error', error.message)
    return null
  }
  if (!pool || pool.is_closed) return null
  return pool
}
