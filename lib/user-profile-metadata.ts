import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { normalizeAvatarLetter } from '@/lib/letter-avatar'

export type UserProfileRow = {
  first_name: string | null
  surname: string | null
  display_name: string
  avatar_letter: string | null
  avatar_colour: string | null
  avatar_url: string | null
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function normalizeColourHex(raw: string | null): string | null {
  if (!raw || !/^#[0-9A-Fa-f]{6}$/.test(raw)) return null
  return `#${raw.slice(1).toLowerCase()}`
}

/** Optional fields from auth user_metadata (signUp options.data). */
export function readProfileMetadataFields(user: User): {
  first_name: string | null
  surname: string | null
  display_name: string | null
  avatar_letter: string | null
  avatar_colour: string | null
} {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  return {
    first_name: metaString(meta, 'first_name'),
    surname: metaString(meta, 'surname'),
    display_name: metaString(meta, 'display_name'),
    avatar_letter: normalizeAvatarLetter(metaString(meta, 'avatar_letter')),
    avatar_colour: normalizeColourHex(metaString(meta, 'avatar_colour')),
  }
}

/** Session-only preview for /login post-confirm modal (set in /auth/callback before signOut). */
export const POST_CONFIRM_PROFILE_PREVIEW_KEY = 'srp_post_confirm_profile_preview_v1'

export type PostConfirmProfilePreview = {
  avatar_letter: string | null
  avatar_colour: string | null
  first_name: string | null
  display_name: string | null
}

export function stashPostConfirmProfilePreview(user: User): void {
  if (typeof window === 'undefined') return
  const m = readProfileMetadataFields(user)
  try {
    const payload: PostConfirmProfilePreview = {
      avatar_letter: m.avatar_letter,
      avatar_colour: m.avatar_colour,
      first_name: m.first_name,
      display_name: m.display_name,
    }
    sessionStorage.setItem(POST_CONFIRM_PROFILE_PREVIEW_KEY, JSON.stringify(payload))
  } catch {
    /* storage blocked */
  }
}

export function readPostConfirmProfilePreview(): PostConfirmProfilePreview | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(POST_CONFIRM_PROFILE_PREVIEW_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as PostConfirmProfilePreview
    if (!o || typeof o !== 'object') return null
    return {
      avatar_letter: typeof o.avatar_letter === 'string' ? o.avatar_letter : null,
      avatar_colour: typeof o.avatar_colour === 'string' ? o.avatar_colour : null,
      first_name: typeof o.first_name === 'string' ? o.first_name : null,
      display_name: typeof o.display_name === 'string' ? o.display_name : null,
    }
  } catch {
    return null
  }
}

export function clearPostConfirmProfilePreview(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(POST_CONFIRM_PROFILE_PREVIEW_KEY)
  } catch {
    /* ignore */
  }
}

/** Full signup payload present in metadata (used after email confirmation). */
export function parseSignupProfileMetadata(user: User): {
  first_name: string
  surname: string
  display_name: string
  avatar_letter: string
  avatar_colour: string
} | null {
  const m = readProfileMetadataFields(user)
  if (!m.first_name || !m.surname || !m.display_name || !m.avatar_letter || !m.avatar_colour) return null
  return {
    first_name: m.first_name,
    surname: m.surname,
    display_name: m.display_name,
    avatar_letter: m.avatar_letter,
    avatar_colour: m.avatar_colour,
  }
}

/** After email confirmation: write profile from metadata (session must be active). */
export async function upsertProfileFromSignupMetadata(
  client: SupabaseClient,
  user: User
): Promise<{ error: Error | null }> {
  const parsed = parseSignupProfileMetadata(user)
  if (!parsed) {
    return { error: new Error('Missing signup metadata on user.') }
  }
  const { error } = await client.from('user_profiles').upsert(
    {
      id: user.id,
      first_name: parsed.first_name,
      surname: parsed.surname,
      display_name: parsed.display_name,
      avatar_letter: parsed.avatar_letter,
      avatar_colour: parsed.avatar_colour,
      avatar_url: null,
    },
    { onConflict: 'id' }
  )
  return { error: error ? new Error(error.message) : null }
}

function isEmpty(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === ''
}

/**
 * If profile row is missing or has empty signup fields, fill only those gaps from user_metadata.
 * Does not overwrite non-empty profile columns.
 */
export async function repairUserProfileFromMetadataIfNeeded(
  client: SupabaseClient,
  user: User,
  existing: UserProfileRow | null
): Promise<{ row: UserProfileRow | null; repaired: boolean }> {
  const m = readProfileMetadataFields(user)
  const hasAnyMeta = !!(m.first_name || m.surname || m.display_name || m.avatar_letter || m.avatar_colour)
  if (!hasAnyMeta) return { row: existing, repaired: false }

  if (!existing) {
    const display_name = m.display_name ?? user.email?.split('@')[0]?.trim() ?? 'Player'
    const { error } = await client.from('user_profiles').upsert(
      {
        id: user.id,
        first_name: m.first_name,
        surname: m.surname,
        display_name,
        avatar_letter: m.avatar_letter,
        avatar_colour: m.avatar_colour,
        avatar_url: null,
      },
      { onConflict: 'id' }
    )
    if (error) return { row: existing, repaired: false }
    return {
      row: {
        first_name: m.first_name,
        surname: m.surname,
        display_name,
        avatar_letter: m.avatar_letter,
        avatar_colour: m.avatar_colour,
        avatar_url: null,
      },
      repaired: true,
    }
  }

  const next: UserProfileRow = {
    first_name: isEmpty(existing.first_name) && m.first_name ? m.first_name : existing.first_name,
    surname: isEmpty(existing.surname) && m.surname ? m.surname : existing.surname,
    display_name: isEmpty(existing.display_name) && m.display_name ? m.display_name : existing.display_name,
    avatar_letter:
      isEmpty(existing.avatar_letter) && m.avatar_letter ? m.avatar_letter : existing.avatar_letter,
    avatar_colour:
      isEmpty(existing.avatar_colour) && m.avatar_colour ? m.avatar_colour : existing.avatar_colour,
    avatar_url: existing.avatar_url,
  }

  const changed =
    next.first_name !== existing.first_name ||
    next.surname !== existing.surname ||
    next.display_name !== existing.display_name ||
    next.avatar_letter !== existing.avatar_letter ||
    next.avatar_colour !== existing.avatar_colour

  if (!changed) return { row: existing, repaired: false }

  const { error } = await client.from('user_profiles').upsert(
    {
      id: user.id,
      first_name: next.first_name,
      surname: next.surname,
      display_name: next.display_name,
      avatar_letter: next.avatar_letter,
      avatar_colour: next.avatar_colour,
      avatar_url: next.avatar_url,
    },
    { onConflict: 'id' }
  )
  if (error) return { row: existing, repaired: false }
  return { row: next, repaired: true }
}
