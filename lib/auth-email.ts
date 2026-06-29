import type { User } from '@supabase/supabase-js'
import type { ProductKey } from '@/lib/product-identity'

/** Stored in `signUp({ options: { data } })` — read by Supabase confirm-signup email templates via `.Data`. */
export const SIGNUP_PRODUCT_METADATA_KEY = 'signup_product' as const

export const AUTH_EMAIL_SENDER_MEMORY_MAP = 'NextPlay Memory Map' as const
export const AUTH_EMAIL_SENDER_PREDICTOR = 'NextPlay Predictor' as const

export function isSignupProductKey(value: unknown): value is ProductKey {
  return value === 'predictor' || value === 'memory_map'
}

/** Which product initiated signup — defaults to Predictor for legacy accounts. */
export function readSignupProduct(user: User | null | undefined): ProductKey {
  if (!user) return 'predictor'
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const raw = meta[SIGNUP_PRODUCT_METADATA_KEY]
  return isSignupProductKey(raw) ? raw : 'predictor'
}

export function isMemoryMapSignup(user: User | null | undefined): boolean {
  return readSignupProduct(user) === 'memory_map'
}

export function signupProductMetadata(product: ProductKey): Record<string, string> {
  return { [SIGNUP_PRODUCT_METADATA_KEY]: product }
}
