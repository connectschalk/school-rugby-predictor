import type { SupabaseClient } from '@supabase/supabase-js'

export const PROFILE_ADMIN_ROLE = 'admin' as const

/** True when `user_profiles.role` is `admin` (source of truth for tool access). */
export function isProfileAdminRole(role: string | null | undefined): boolean {
  return role === PROFILE_ADMIN_ROLE
}

export async function fetchUserIsAdmin(
  client: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; error: Error | null }> {
  const { data, error } = await client.from('user_profiles').select('role').eq('id', userId).maybeSingle()

  if (error) return { isAdmin: false, error: new Error(error.message) }
  const row = data as { role?: string } | null
  return { isAdmin: isProfileAdminRole(row?.role ?? null), error: null }
}
