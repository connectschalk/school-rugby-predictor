import type { Metadata } from 'next'
import {
  absoluteMemoryMapShareImageUrl,
  DEFAULT_MEMORY_MAP_LOGO_HEIGHT,
  DEFAULT_MEMORY_MAP_LOGO_WIDTH,
  DEFAULT_MEMORY_MAP_SHARE_DESCRIPTION,
  hasCustomMemoryMapLogo,
} from '@/lib/memory-map/branding'
import type { MemoryMap } from '@/lib/memory-map/types'
import { getPublicSiteUrl } from '@/lib/site-url'

export function buildMemoryMapMetadata(map: MemoryMap): Metadata {
  const title = `${map.title} · NextPlay Memory Map`
  const description =
    map.description?.trim() || map.tagline?.trim() || DEFAULT_MEMORY_MAP_SHARE_DESCRIPTION
  const shareImage = absoluteMemoryMapShareImageUrl(map)
  const customLogo = hasCustomMemoryMapLogo(map)
  const url = `${getPublicSiteUrl()}/memory-map/${map.slug}`

  const ogImage = {
    url: shareImage,
    alt: `${map.title} Memory Map`,
    ...(customLogo
      ? {}
      : {
          width: DEFAULT_MEMORY_MAP_LOGO_WIDTH,
          height: DEFAULT_MEMORY_MAP_LOGO_HEIGHT,
          type: 'image/png' as const,
        }),
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'NextPlay Memory Map',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [shareImage],
    },
    robots: map.visibility === 'public' ? { index: true, follow: true } : { index: false, follow: false },
  }
}
