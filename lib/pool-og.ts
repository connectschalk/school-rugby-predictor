import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import {
  PLATFORM_LOGO_ALT,
  PLATFORM_METADATA_DESCRIPTION,
  PLATFORM_NAME,
  PLATFORM_OG_IMAGE_SRC,
  platformOpenGraphImages,
} from '@/lib/platform-branding'
import { fetchPoolInviteByToken, type PoolInvitePreview } from '@/lib/pools'
import { absolutePoolJoinUrl, absolutePoolOgImageUrl } from '@/lib/site-url'

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

export function createPoolOgClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function fetchPoolInviteForOg(token: string): Promise<PoolInvitePreview | null> {
  const trimmed = normalizePoolInviteToken(token)
  if (!trimmed) return null
  const client = createPoolOgClient()
  if (!client) return null
  const { pool, error } = await fetchPoolInviteByToken(client, trimmed)
  if (error || !pool || pool.is_closed) return null
  return pool
}

/** Cache-bust OG image when pool logo changes (WhatsApp caches aggressively). */
export function poolOgImageVersion(pool: Pick<PoolInvitePreview, 'id' | 'logo_url'>): string {
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

type ShareMetadataOptions = {
  competitionSlug?: string | null
  from?: string | null
}

export async function buildPoolShareMetadata(
  token: string,
  opts?: ShareMetadataOptions
): Promise<Metadata> {
  const pool = await fetchPoolInviteForOg(token)

  if (!pool) {
    return {
      title: `Join a prediction pool on ${PLATFORM_NAME}`,
      description: PLATFORM_METADATA_DESCRIPTION,
      openGraph: {
        title: `Join a prediction pool on ${PLATFORM_NAME}`,
        description: PLATFORM_METADATA_DESCRIPTION,
        siteName: PLATFORM_NAME,
        type: 'website',
        images: platformOpenGraphImages(),
      },
      twitter: {
        card: 'summary_large_image',
        title: `Join a prediction pool on ${PLATFORM_NAME}`,
        description: PLATFORM_METADATA_DESCRIPTION,
        images: [PLATFORM_OG_IMAGE_SRC],
      },
    }
  }

  const title = buildPoolShareTitle(pool.name)
  const description = buildPoolShareDescription(pool.competition_name)
  const pageUrl = absolutePoolJoinUrl(
    opts?.competitionSlug ?? pool.competition_slug,
    pool.invite_token,
    opts?.from
  )
  const ogImageUrl = absolutePoolOgImageUrl(pool.invite_token, poolOgImageVersion(pool))

  return {
    title,
    description,
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
}
