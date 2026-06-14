import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

/** Optional `from` (sharer) query on pool join links — must be a UUID. */
export const POOL_INVITE_FROM_PARAM = 'from' as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(s: string | null | undefined): boolean {
  return Boolean(s && UUID_RE.test(s.trim()))
}

export function normalizePoolInviteCompetitionSlug(slug: string | null | undefined): string {
  const s = slug?.trim().toLowerCase()
  return s || SCHOOLS_COMPETITION_SLUG
}

/** Canonical invite URL for a competition pool. */
export function buildPoolJoinPath(
  token: string,
  fromUserId?: string | null,
  competitionSlug?: string | null
): string {
  const t = token.trim()
  if (!t) return '/pools'
  const slug = normalizePoolInviteCompetitionSlug(competitionSlug)
  const base = `/competitions/${encodeURIComponent(slug)}/pools/join/${encodeURIComponent(t)}`
  if (fromUserId && isUuid(fromUserId)) {
    return `${base}?${POOL_INVITE_FROM_PARAM}=${encodeURIComponent(fromUserId.trim())}`
  }
  return base
}

/** Legacy invite path (redirects client-side to canonical competition URL). */
export function buildLegacyPoolJoinPath(token: string, fromUserId?: string | null): string {
  const t = token.trim()
  if (!t) return '/pools'
  const base = `/pools/join/${encodeURIComponent(t)}`
  if (fromUserId && isUuid(fromUserId)) {
    return `${base}?${POOL_INVITE_FROM_PARAM}=${encodeURIComponent(fromUserId.trim())}`
  }
  return base
}
