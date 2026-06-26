import type { Metadata } from 'next'
import type { MemoryMap } from '@/lib/memory-map/types'
import { getPublicSiteUrl } from '@/lib/site-url'

export function buildMemoryMapMetadata(map: MemoryMap): Metadata {
  const title = `${map.title} · NextPlay Memory Map`
  const description =
    map.description?.trim() ||
    map.tagline?.trim() ||
    'Explore the stories that happened here on the NextPlay Memory Map.'
  const ogImage = map.landing_background_url ?? map.profile_image_url ?? undefined
  const url = `${getPublicSiteUrl()}/memory-map/${map.slug}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'NextPlay Memory Map',
      ...(ogImage ? { images: [{ url: ogImage, alt: map.title }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: map.visibility === 'public' ? { index: true, follow: true } : { index: false, follow: false },
  }
}
