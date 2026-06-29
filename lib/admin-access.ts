import type { SupabaseClient } from '@supabase/supabase-js'

export const PROFILE_ADMIN_ROLE = 'admin' as const

/** True when `user_profiles.role` is `admin` (legacy Predictor flag). */
export function isProfileAdminRole(role: string | null | undefined): boolean {
  return role === PROFILE_ADMIN_ROLE
}

/** Predictor platform admin — pools, fixtures, internal tools. Not Memory Map. */
export async function fetchPredictorPlatformAdmin(
  client: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; error: Error | null }> {
  const { data: roleRows, error: roleErr } = await client
    .from('user_product_roles')
    .select('product_key')
    .eq('user_id', userId)
    .eq('role', 'platform_admin')
    .in('product_key', ['global', 'predictor'])

  if (roleErr) return { isAdmin: false, error: new Error(roleErr.message) }
  if ((roleRows ?? []).length > 0) return { isAdmin: true, error: null }

  const { data, error } = await client.from('user_profiles').select('role').eq('id', userId).maybeSingle()
  if (error) return { isAdmin: false, error: new Error(error.message) }
  const row = data as { role?: string } | null
  return { isAdmin: isProfileAdminRole(row?.role ?? null), error: null }
}

/** Memory Map platform admin — map/org management. Not Predictor tools. */
export async function fetchMemoryMapPlatformAdmin(
  client: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; error: Error | null }> {
  const { data, error } = await client
    .from('user_product_roles')
    .select('product_key')
    .eq('user_id', userId)
    .eq('role', 'platform_admin')
    .in('product_key', ['global', 'memory_map'])

  if (error) return { isAdmin: false, error: new Error(error.message) }
  return { isAdmin: (data ?? []).length > 0, error: null }
}

/** @deprecated Use fetchPredictorPlatformAdmin for Predictor or fetchMemoryMapPlatformAdmin for Memory Map. */
export async function fetchUserIsAdmin(
  client: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; error: Error | null }> {
  return fetchPredictorPlatformAdmin(client, userId)
}
