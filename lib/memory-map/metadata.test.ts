import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MEMORY_MAP_LOGO_SRC } from './branding'
import { buildMemoryMapMetadata } from './metadata'
import type { MemoryMap } from './types'

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrl: () => 'https://www.thenextplay.co.za',
}))

const baseMap: MemoryMap = {
  id: 'map-1',
  organisation_id: 'org-1',
  title: 'Boishaai Memory Map',
  slug: 'boishaai',
  tagline: 'Every place has a story',
  description: 'School memories across campus.',
  visibility: 'public',
  status: 'active',
  default_lat: -33.9249,
  default_lng: 18.4241,
  default_zoom: 17,
  sponsor_name: null,
  sponsor_logo_url: null,
  sponsor_website_url: null,
  sponsor_message: null,
  primary_color: '#FFD400',
  primary_text_color: '#050505',
  secondary_color: 'transparent',
  secondary_text_color: '#FFFFFF',
  accent_color: '#FFD400',
  profile_image_url: 'https://example.com/profile.jpg',
  landing_background_url: 'https://example.com/bg.jpg',
}

describe('buildMemoryMapMetadata', () => {
  it('sets title and open graph fields with custom logo', () => {
    const meta = buildMemoryMapMetadata(baseMap)
    expect(meta.title).toContain('Boishaai Memory Map')
    expect(meta.openGraph?.title).toContain('Boishaai Memory Map')
    expect(meta.openGraph?.images?.[0]).toMatchObject({
      url: 'https://example.com/profile.jpg',
      alt: 'Boishaai Memory Map Memory Map',
    })
    expect(meta.twitter?.card).toBe('summary_large_image')
  })

  it('uses default Memory Map logo when no custom logo is set', () => {
    const meta = buildMemoryMapMetadata({
      ...baseMap,
      profile_image_url: null,
      landing_background_url: 'https://example.com/bg.jpg',
    })
    expect(meta.openGraph?.images?.[0]).toMatchObject({
      url: `https://www.thenextplay.co.za${DEFAULT_MEMORY_MAP_LOGO_SRC}`,
      type: 'image/png',
    })
  })

  it('prefers profile image over landing background for share image', () => {
    const meta = buildMemoryMapMetadata(baseMap)
    const imageUrl = Array.isArray(meta.openGraph?.images)
      ? meta.openGraph.images[0]
      : meta.openGraph?.images
    expect(imageUrl).toMatchObject({ url: baseMap.profile_image_url })
  })
})
