import { describe, expect, it } from 'vitest'
import { buildMemoryMapMetadata } from './metadata'
import type { MemoryMap } from './types'

const baseMap: MemoryMap = {
  id: 'map-1',
  organisation_id: 'org-1',
  title: 'Boishaai Memory Map',
  slug: 'boishaai',
  tagline: 'Every place has a story',
  description: 'School memories across campus.',
  visibility: 'public',
  status: 'active',
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
  it('sets title and open graph fields', () => {
    const meta = buildMemoryMapMetadata(baseMap)
    expect(meta.title).toContain('Boishaai Memory Map')
    expect(meta.openGraph?.title).toContain('Boishaai Memory Map')
    expect(meta.openGraph?.images?.[0]).toMatchObject({ url: baseMap.landing_background_url })
  })

  it('uses profile image when no background', () => {
    const meta = buildMemoryMapMetadata({ ...baseMap, landing_background_url: null })
    expect(meta.openGraph?.images?.[0]).toMatchObject({ url: baseMap.profile_image_url })
  })
})
