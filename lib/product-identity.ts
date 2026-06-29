import type { SupabaseClient } from '@supabase/supabase-js'

/** Product scope for identity, profiles, and platform admin roles. */
export type ProductKey = 'predictor' | 'memory_map' | 'global'

export type ProductPlatformRole = 'platform_admin'

export type UserProductRoleRow = {
  user_id: string
  product_key: ProductKey
  role: ProductPlatformRole
  granted_at: string
  granted_by: string | null
}

const PRODUCT_ROLE_TABLE = 'user_product_roles'

export async function fetchUserHasProductPlatformAdmin(
  client: SupabaseClient,
  userId: string,
  productKey: ProductKey
): Promise<{ isAdmin: boolean; error: Error | null }> {
  if (productKey === 'global') {
    const { data, error } = await client
      .from(PRODUCT_ROLE_TABLE)
      .select('role')
      .eq('user_id', userId)
      .eq('product_key', 'global')
      .eq('role', 'platform_admin')
      .maybeSingle()

    if (error) return { isAdmin: false, error: new Error(error.message) }
    return { isAdmin: Boolean(data), error: null }
  }

  const keys: ProductKey[] = productKey === 'predictor' ? ['global', 'predictor'] : ['global', 'memory_map']

  const { data, error } = await client
    .from(PRODUCT_ROLE_TABLE)
    .select('product_key')
    .eq('user_id', userId)
    .eq('role', 'platform_admin')
    .in('product_key', keys)

  if (error) return { isAdmin: false, error: new Error(error.message) }
  return { isAdmin: (data ?? []).length > 0, error: null }
}
