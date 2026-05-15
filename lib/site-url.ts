/** Canonical public site when `NEXT_PUBLIC_SITE_URL` is unset (not the Vercel preview URL). */
export const DEFAULT_PUBLIC_SITE_URL = 'https://thenextplay.co.za'

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
