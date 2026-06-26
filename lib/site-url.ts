import { buildPoolJoinPath } from '@/lib/pool-invite-path'

/** Canonical public site when `NEXT_PUBLIC_SITE_URL` is unset (not the Vercel preview URL). */
export const DEFAULT_PUBLIC_SITE_URL = 'https://www.thenextplay.co.za'

/**
 * Base URL for share links and emails (no trailing slash).
 * Uses `NEXT_PUBLIC_SITE_URL` when set; otherwise `DEFAULT_PUBLIC_SITE_URL`.
 */
export function getPublicSiteUrl(): string {
  let raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim()
  if (!raw) return DEFAULT_PUBLIC_SITE_URL
  raw = raw.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, '')}`
  }
  return raw
}

/** Full URL for a One Match Challenge share link. */
export function absoluteOneMatchChallengeUrl(slug: string): string {
  return `${getPublicSiteUrl()}/one-match/${encodeURIComponent(slug.trim())}`
}

/** Absolute OG image URL for crawlers (Facebook, WhatsApp, Twitter). */
export function absoluteOneMatchOgImageUrl(slug: string): string {
  return `${getPublicSiteUrl()}/game/${encodeURIComponent(slug.trim())}/opengraph-image`
}

/** Absolute pool invite OG image URL; optional version busts WhatsApp cache when logo changes. */
export function absolutePoolOgImageUrl(token: string, version?: string | number): string {
  const t = encodeURIComponent(token.trim())
  const base = `${getPublicSiteUrl()}/api/og/pool/${t}`
  if (version == null || version === '') return base
  return `${base}?v=${encodeURIComponent(String(version))}`
}

/** Absolute public Memory Map landing URL. */
export function absoluteMemoryMapUrl(slug: string): string {
  return `${getPublicSiteUrl()}/memory-map/${encodeURIComponent(slug.trim())}`
}

/** Canonical absolute pool join URL for share metadata. */
export function absolutePoolJoinUrl(
  competitionSlug: string,
  token: string,
  fromUserId?: string | null
): string {
  return `${getPublicSiteUrl()}${buildPoolJoinPath(token, fromUserId, competitionSlug)}`
}
