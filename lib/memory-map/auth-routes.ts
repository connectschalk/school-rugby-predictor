import { safeInternalReturnPath } from '@/lib/auth-return-path'

export const MEMORY_MAP_AUTH_DEFAULT = '/memory-map' as const
export const MEMORY_MAP_ACCOUNT_PATH = '/memory-map/account' as const
export const MEMORY_MAP_CREATE_PASSWORD_PATH = '/memory-map/auth/create-password' as const

const MEMORY_MAP_AUTH_PREFIX = '/memory-map/auth/'

/** Only allow internal Memory Map paths (prevents open redirects). */
export function safeMemoryMapReturnPath(next: string | null | undefined): string | null {
  const safe = safeInternalReturnPath(next)
  if (!safe?.startsWith('/memory-map')) return null
  return safe
}

export function isMemoryMapAuthEntryPath(path: string): boolean {
  const base = path.split('?')[0]?.split('#')[0] ?? path
  return base.startsWith(MEMORY_MAP_AUTH_PREFIX)
}

export function resolveMemoryMapPostAuthRedirect(next: string | null | undefined): string {
  const safe = safeMemoryMapReturnPath(next)
  if (safe && !isMemoryMapAuthEntryPath(safe)) return safe
  return MEMORY_MAP_AUTH_DEFAULT
}

export function buildMemoryMapSignInHref(returnPath?: string | null): string {
  const safe = safeMemoryMapReturnPath(returnPath)
  if (safe && !isMemoryMapAuthEntryPath(safe)) {
    return `/memory-map/auth/sign-in?next=${encodeURIComponent(safe)}`
  }
  return '/memory-map/auth/sign-in'
}

export function buildMemoryMapSignUpHref(returnPath?: string | null): string {
  const safe = safeMemoryMapReturnPath(returnPath)
  if (safe && !isMemoryMapAuthEntryPath(safe)) {
    return `/memory-map/auth/sign-up?next=${encodeURIComponent(safe)}`
  }
  return '/memory-map/auth/sign-up'
}

export function isMemoryMapInvitePath(path: string): boolean {
  const base = path.split('?')[0]?.split('#')[0] ?? path
  return base.startsWith('/memory-map/invite/')
}

export function buildMemoryMapCreatePasswordHref(returnPath?: string | null): string {
  const safe = safeMemoryMapReturnPath(returnPath) ?? MEMORY_MAP_AUTH_DEFAULT
  return `${MEMORY_MAP_CREATE_PASSWORD_PATH}?next=${encodeURIComponent(safe)}`
}

export function parseMemoryMapSlugFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'memory-map' || !parts[1]) return null
  const segment = parts[1]
  if (['admin', 'account', 'find', 'invite', 'my', 'auth', 'orgs'].includes(segment)) return null
  return segment
}

export function parseMemoryMapAdminIdFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'memory-map' || parts[1] !== 'admin' || !parts[2]) return null
  if (parts[2] === 'create') return null
  return parts[2]
}

export function currentPathWithSearch(pathname: string, searchParams: URLSearchParams | null): string {
  const query = searchParams?.toString()
  return query ? `${pathname}?${query}` : pathname
}
