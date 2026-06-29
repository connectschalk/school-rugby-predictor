import type { User } from '@supabase/supabase-js'
import { isMemoryMapSignup } from '@/lib/auth-email'
import { safeInternalReturnPath } from '@/lib/auth-return-path'
import { getPublicSiteUrl } from '@/lib/site-url'

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`
  }
  return url
}

/**
 * Canonical base URL for Supabase auth redirects (email confirm, password reset).
 * Prefer `NEXT_PUBLIC_APP_URL`; falls back to `NEXT_PUBLIC_SITE_URL` / production default.
 */
export function getAuthRedirectBaseUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
  if (appUrl) return normalizeBaseUrl(appUrl)
  return getPublicSiteUrl()
}

/** Client-side base URL — uses the current origin when available (preview deploys). */
export function getAuthRedirectBaseUrlClient(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }
  return getAuthRedirectBaseUrl()
}

function authRedirectBase(): string {
  return typeof window !== 'undefined' ? getAuthRedirectBaseUrlClient() : getAuthRedirectBaseUrl()
}

/** Supabase `emailRedirectTo` for PKCE/email confirmation. */
export function buildAuthCallbackUrl(nextPath: string): string {
  const base = authRedirectBase()
  const safeNext = safeInternalReturnPath(nextPath)
  if (!safeNext) return `${base}/auth/callback`
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`
}

/** Memory Map sign-up / invite: confirm email, then sign in inside Memory Map. */
export function buildMemoryMapEmailConfirmCallbackUrl(memoryMapReturnPath: string): string {
  const safeReturn = safeInternalReturnPath(memoryMapReturnPath) ?? '/memory-map'
  const signInPath = `/memory-map/auth/sign-in?next=${encodeURIComponent(safeReturn)}`
  return buildAuthCallbackUrl(signInPath)
}

/** Supabase `redirectTo` for password reset emails. */
export function buildPasswordUpdateRedirectUrl(nextPath?: string | null): string {
  const base = authRedirectBase()
  const safeNext = safeInternalReturnPath(nextPath)
  if (!safeNext) return `${base}/auth/update-password`
  return `${base}/auth/update-password?next=${encodeURIComponent(safeNext)}`
}

function decodeNextParam(nextParam: string | null | undefined): string | null {
  if (nextParam == null || nextParam === '') return null
  try {
    return decodeURIComponent(nextParam)
  } catch {
    return null
  }
}

/**
 * Where to send the user after `/auth/callback` finishes (session is cleared; user signs in again).
 */
export function resolveEmailConfirmRedirect(
  nextParam: string | null | undefined,
  user?: User | null
): string {
  const safe = safeInternalReturnPath(decodeNextParam(nextParam))
  if (safe) {
    if (safe.startsWith('/memory-map')) return safe
    if (safe.startsWith('/login')) {
      return safe.includes('confirmed=')
        ? safe
        : `${safe}${safe.includes('?') ? '&' : '?'}confirmed=1`
    }
    return safe
  }

  if (user && isMemoryMapSignup(user)) {
    return '/memory-map/auth/sign-in?confirmed=1'
  }

  return '/login?confirmed=1'
}

/** Fallback when email confirmation fails. */
export function resolveEmailConfirmErrorRedirect(nextParam: string | null | undefined): string {
  const safe = safeInternalReturnPath(decodeNextParam(nextParam))
  if (safe?.startsWith('/memory-map')) return '/memory-map/auth/sign-in'
  return '/login'
}
