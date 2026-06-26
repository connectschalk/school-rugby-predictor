import { describe, expect, it } from 'vitest'
import { resolvePublicMemoryMapBundle } from './queries'

describe('resolvePublicMemoryMapBundle', () => {
  const supabaseMap = {
    id: 'real-map-id',
    organisation_id: 'org-1',
    title: 'Saved Boishaai',
    slug: 'boishaai',
    tagline: 'Custom tagline',
    description: 'Saved description',
    visibility: 'link_only',
    status: 'active',
    profile_image_url: 'https://example.com/profile.jpg',
    landing_background_url: 'https://example.com/bg.jpg',
    primary_color: '#0066CC',
    primary_text_color: '#FFFFFF',
    secondary_color: 'transparent',
    secondary_text_color: '#FFFFFF',
    accent_color: '#0066CC',
    sponsor_name: 'Kuehne+Nagel',
    sponsor_logo_url: null,
    sponsor_website_url: 'https://example.com',
    sponsor_message: 'Proud sponsor',
    organisations: { id: 'org-1', name: 'Boishaai', slug: 'boishaai', type: 'school', logo_url: null, description: null },
  }

  it('uses Supabase map branding when a real row exists', () => {
    const result = resolvePublicMemoryMapBundle('boishaai', supabaseMap, {
      areas: [],
      categories: [],
      pins: [],
      stories: [],
      tags: [],
    })
    expect(result?.source).toBe('supabase')
    expect(result?.bundle.map.title).toBe('Saved Boishaai')
    expect(result?.bundle.map.sponsor_name).toBe('Kuehne+Nagel')
    expect(result?.bundle.map.primary_color).toBe('#0066CC')
    expect(result?.bundle.areas).toEqual([])
  })

  it('does not inject demo areas when Supabase map has none', () => {
    const result = resolvePublicMemoryMapBundle('boishaai', supabaseMap, {
      areas: [],
      categories: [],
      pins: [],
      stories: [],
      tags: [],
    })
    expect(result?.bundle.areas).toHaveLength(0)
    expect(result?.bundle.pins).toHaveLength(0)
    expect(result?.bundle.stories).toHaveLength(0)
  })

  it('returns null when no Supabase map row', () => {
    expect(
      resolvePublicMemoryMapBundle('boishaai', null, {
        areas: [],
        categories: [],
        pins: [],
        stories: [],
        tags: [],
      })
    ).toBeNull()
  })
})
