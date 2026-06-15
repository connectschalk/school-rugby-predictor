/** Default landing page after sign-in when no `next` / return URL is provided. */
export const POST_AUTH_DEFAULT_PATH = '/' as const

/** Prevent open redirects: only same-site relative paths. */
export function safeInternalReturnPath(next: string | null | undefined): string | null {
  if (next == null || next === undefined) return null
  const t = String(next).trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  if (t.includes('://')) return null
  return t
}

/** Auth entry routes must not be used as post-login destinations (avoids redirect loops). */
export function isAuthEntryPath(path: string): boolean {
  const base = path.split('?')[0]?.split('#')[0] ?? path
  return base === '/login' || base === '/signup' || base === '/auth/callback' || base === '/auth/update-password'
}

/** Post-auth destination: deep link when safe, otherwise competition home. */
export function resolvePostAuthRedirect(next: string | null | undefined): string {
  const safe = safeInternalReturnPath(next)
  if (safe && !isAuthEntryPath(safe)) return safe
  return POST_AUTH_DEFAULT_PATH
}

export function buildLoginHref(returnPath?: string | null): string {
  const safe = safeInternalReturnPath(returnPath)
  if (safe && !isAuthEntryPath(safe)) {
    return `/login?next=${encodeURIComponent(safe)}`
  }
  return '/login'
}

export function buildSignupHref(returnPath?: string | null): string {
  const safe = safeInternalReturnPath(returnPath)
  if (safe && !isAuthEntryPath(safe)) {
    return `/signup?next=${encodeURIComponent(safe)}`
  }
  return '/signup'
}
