import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { UserProfileRow } from '@/lib/user-profile-metadata'

export type PredictorProfileRow = UserProfileRow & {
  user_id: string
  username: string | null
  onboarding_completed_at: string | null
}

const TABLE = 'predictor_profiles'

function emailUsernameFallback(user: User): string {
  return user.email?.split('@')[0]?.trim() || 'Player'
}

/** Read Predictor display profile — never falls back to Memory Map data. */
export async function fetchPredictorProfile(
  client: SupabaseClient,
  userId: string
): Promise<{ profile: PredictorProfileRow | null; error: Error | null }> {
  const { data, error } = await client
    .from(TABLE)
    .select(
      'user_id, display_name, first_name, surname, avatar_url, avatar_letter, avatar_colour, username, onboarding_completed_at'
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { profile: null, error: new Error(error.message) }
  if (!data) return { profile: null, error: null }

  return {
    profile: {
      user_id: String(data.user_id),
      display_name: String(data.display_name),
      first_name: data.first_name == null ? null : String(data.first_name),
      surname: data.surname == null ? null : String(data.surname),
      avatar_url: data.avatar_url == null ? null : String(data.avatar_url),
      avatar_letter: data.avatar_letter == null ? null : String(data.avatar_letter),
      avatar_colour: data.avatar_colour == null ? null : String(data.avatar_colour),
      username: data.username == null ? null : String(data.username),
      onboarding_completed_at:
        data.onboarding_completed_at == null ? null : String(data.onboarding_completed_at),
    },
    error: null,
  }
}

/** Ensures a Predictor profile row exists. Does not touch Memory Map profiles. */
export async function ensurePredictorProfileExists(
  client: SupabaseClient,
  user: User
): Promise<{ error: Error | null; created: boolean }> {
  const { data: existing, error: readErr } = await client
    .from(TABLE)
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (readErr) return { error: new Error(readErr.message), created: false }
  if (existing) return { error: null, created: false }

  const { error } = await client.from(TABLE).insert({
    user_id: user.id,
    display_name: emailUsernameFallback(user),
  })

  if (error) {
    if (error.code === '23505') return { error: null, created: false }
    return { error: new Error(error.message), created: false }
  }

  return { error: null, created: true }
}
