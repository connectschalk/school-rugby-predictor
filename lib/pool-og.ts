import type { Metadata } from 'next'
import { isUuid } from '@/lib/pool-invite-path'
import { fetchPoolInviteForOg } from '@/lib/pool-invite-server'
import {
  PLATFORM_LOGO_ALT,
  PLATFORM_METADATA_DESCRIPTION,
  PLATFORM_NAME,
  PLATFORM_OG_IMAGE_HEIGHT,
  PLATFORM_OG_IMAGE_SRC,
  PLATFORM_OG_IMAGE_WIDTH,
} from '@/lib/platform-branding'
import { absolutePoolJoinUrl, absolutePoolOgImageUrl, getPublicSiteUrl } from '@/lib/site-url'

export function normalizePoolInviteToken(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s)
  } catch {
    /* keep original */
  }
  return s.trim()
}

/** Cache-bust OG image when pool logo changes (WhatsApp caches aggressively). */
export function poolOgImageVersion(pool: { id: string; logo_url: string | null }): string {
  const logo = pool.logo_url?.trim()
  if (!logo) return '0'
  const ts = logo.match(/logo-(\d+)\./i)?.[1]
  if (ts) return ts
  let h = 5381
  for (let i = 0; i < logo.length; i++) {
    h = ((h << 5) + h) ^ logo.charCodeAt(i)
  }
  return String(h >>> 0)
}

export function buildPoolShareTitle(poolName: string): string {
  const name = poolName.trim() || 'this pool'
  return `Join ${name} on NextPlay Predictor`
}

export function buildPoolShareDescription(competitionName: string): string {
  const comp = competitionName.trim() || 'your competition'
  return `Predict scores, compete with friends, and follow the leaderboard for ${comp}.`
}

export function buildPoolShareFallbackMetadata(): Metadata {
  const title = `Join a prediction pool on ${PLATFORM_NAME}`
  const ogImage = `${getPublicSiteUrl()}${PLATFORM_OG_IMAGE_SRC}`
  return {
    title,
    description: PLATFORM_METADATA_DESCRIPTION,
    openGraph: {
      title,
      description: PLATFORM_METADATA_DESCRIPTION,
      siteName: PLATFORM_NAME,
      type: 'website',
      images: [
        {
          url: ogImage,
          width: PLATFORM_OG_IMAGE_WIDTH,
          height: PLATFORM_OG_IMAGE_HEIGHT,
          alt: PLATFORM_LOGO_ALT,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: PLATFORM_METADATA_DESCRIPTION,
      images: [ogImage],
    },
  }
}

type ShareMetadataOptions = {
  competitionSlug?: string | null
  from?: string | null
}

export async function buildPoolShareMetadata(
  token: string,
  opts?: ShareMetadataOptions
): Promise<Metadata> {
  try {
    const normalizedToken = normalizePoolInviteToken(token)
    if (!normalizedToken) return buildPoolShareFallbackMetadata()

    const pool = await fetchPoolInviteForOg(normalizedToken)
    if (!pool) return buildPoolShareFallbackMetadata()

    const title = buildPoolShareTitle(pool.name)
    const description = buildPoolShareDescription(pool.competition_name)
    const safeFrom = opts?.from && isUuid(opts.from) ? opts.from : null
    const pageUrl = absolutePoolJoinUrl(
      opts?.competitionSlug ?? pool.competition_slug,
      pool.invite_token || normalizedToken,
      safeFrom
    )
    const ogImageUrl = absolutePoolOgImageUrl(
      pool.invite_token || normalizedToken,
      poolOgImageVersion(pool)
    )

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        title,
        description,
        url: pageUrl,
        siteName: PLATFORM_NAME,
        type: 'website',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `${pool.name} — ${PLATFORM_LOGO_ALT}`,
            type: 'image/png',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl],
      },
    }
  } catch (err) {
    console.error('[pool-og] buildPoolShareMetadata failed', err)
    return buildPoolShareFallbackMetadata()
  }
}
