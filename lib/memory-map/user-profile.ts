import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

export type MemoryMapProfileRow = {
  user_id: string
  display_name: string | null
  contributor_name: string | null
  avatar_url: string | null
  onboarding_completed_at: string | null
}

const TABLE = 'memory_map_profiles'

function emailUsernameFallback(user: User): string {
  return user.email?.split('@')[0]?.trim() || 'Contributor'
}

/** Read Memory Map profile — never falls back to Predictor profile fields. */
export async function fetchMemoryMapProfile(
  client: SupabaseClient,
  userId: string
): Promise<{ profile: MemoryMapProfileRow | null; error: Error | null }> {
  const { data, error } = await client
    .from(TABLE)
    .select('user_id, display_name, contributor_name, avatar_url, onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { profile: null, error: new Error(error.message) }
  if (!data) return { profile: null, error: null }

  return {
    profile: {
      user_id: String(data.user_id),
      display_name: data.display_name == null ? null : String(data.display_name),
      contributor_name: data.contributor_name == null ? null : String(data.contributor_name),
      avatar_url: data.avatar_url == null ? null : String(data.avatar_url),
      onboarding_completed_at:
        data.onboarding_completed_at == null ? null : String(data.onboarding_completed_at),
    },
    error: null,
  }
}

/** Default contributor / menu display name for Memory Map — product-scoped only. */
export function resolveMemoryMapContributorName(
  profile: MemoryMapProfileRow | null,
  user?: User | null
): string | null {
  const fromProfile = profile?.contributor_name?.trim() || profile?.display_name?.trim()
  if (fromProfile) return fromProfile

  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const fromMeta =
    (typeof meta.memory_map_display_name === 'string' && meta.memory_map_display_name.trim()) ||
    (typeof meta.memory_map_contributor_name === 'string' && meta.memory_map_contributor_name.trim()) ||
    null
  if (fromMeta) return fromMeta

  return emailUsernameFallback(user)
}

/** Ensures a Memory Map profile row exists. Does not touch Predictor profiles. */
export async function ensureMemoryMapProfileExists(
  client: SupabaseClient,
  user: User,
  opts?: { displayName?: string; contributorName?: string }
): Promise<{ error: Error | null; created: boolean }> {
  const { data: existing, error: readErr } = await client
    .from(TABLE)
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (readErr) return { error: new Error(readErr.message), created: false }

  const displayName = opts?.displayName?.trim() || null
  const contributorName = opts?.contributorName?.trim() || displayName

  if (existing) {
    if (!displayName && !contributorName) return { error: null, created: false }
    const patch: Record<string, string> = {}
    if (displayName) patch.display_name = displayName
    if (contributorName) patch.contributor_name = contributorName
    const { error } = await client.from(TABLE).update(patch).eq('user_id', user.id)
    if (error) return { error: new Error(error.message), created: false }
    return { error: null, created: false }
  }

  const fallback = displayName ?? emailUsernameFallback(user)
  const { error } = await client.from(TABLE).insert({
    user_id: user.id,
    display_name: fallback,
    contributor_name: contributorName ?? fallback,
    avatar_url: null,
  })

  if (error) {
    if (error.code === '23505') return { error: null, created: false }
    return { error: new Error(error.message), created: false }
  }

  return { error: null, created: true }
}

export type MemoryMapProfileUpdate = {
  display_name?: string
  contributor_name?: string
  avatar_url?: string | null
}

/** Save Memory Map profile fields only — never touches Predictor tables. */
export async function updateMemoryMapProfile(
  client: SupabaseClient,
  userId: string,
  patch: MemoryMapProfileUpdate
): Promise<{ error: Error | null }> {
  const row: Record<string, string | null> = {}
  if (patch.display_name !== undefined) row.display_name = patch.display_name
  if (patch.contributor_name !== undefined) row.contributor_name = patch.contributor_name
  if (patch.avatar_url !== undefined) row.avatar_url = patch.avatar_url

  if (Object.keys(row).length === 0) return { error: null }

  const { error } = await client.from(TABLE).update(row).eq('user_id', userId)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}
