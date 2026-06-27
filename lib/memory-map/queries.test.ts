import { describe, expect, it } from 'vitest'
import {
  resolveMemoryMapBundleLoad,
  resolvePublicMemoryMapBundle,
  loadContributorMemoryMapBundleBySlug,
  isSupabaseConfigured,
} from './queries'

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

describe('resolveMemoryMapBundleLoad', () => {
  const supabaseMap = {
    id: 'real-map-id',
    organisation_id: 'org-1',
    title: 'Saved Boishaai',
    slug: 'boishaai',
    tagline: null,
    description: null,
    visibility: 'link_only',
    status: 'active',
    profile_image_url: null,
    landing_background_url: null,
    primary_color: '#0066CC',
    primary_text_color: '#FFFFFF',
    secondary_color: 'transparent',
    secondary_text_color: '#FFFFFF',
    accent_color: '#0066CC',
    default_lat: null,
    default_lng: null,
    default_zoom: null,
    sponsor_name: null,
    sponsor_logo_url: null,
    sponsor_website_url: null,
    sponsor_message: null,
    organisations: { id: 'org-1', name: 'Boishaai', slug: 'boishaai', type: 'school', logo_url: null, description: null },
  }

  it('uses supabase bundle with zero areas and does not fall back to demo', () => {
    const loaded = resolveMemoryMapBundleLoad('boishaai', {
      map: supabaseMap,
      related: { areas: [], categories: [], pins: [], stories: [], tags: [] },
    })
    expect(loaded?.source).toBe('supabase')
    expect(loaded?.bundle.areas).toHaveLength(0)
    expect(loaded?.bundle.areas.some((a) => a.id === 'area-campus')).toBe(false)
  })

  it('resolves draft maps with empty content without demo fallback', () => {
    const draftMap = { ...supabaseMap, status: 'draft' }
    const loaded = resolveMemoryMapBundleLoad('boishaai', {
      map: draftMap,
      related: { areas: [], categories: [], pins: [], stories: [], tags: [] },
    })
    expect(loaded?.source).toBe('supabase')
    expect(loaded?.bundle.map.status).toBe('draft')
    expect(loaded?.bundle.areas).toHaveLength(0)
  })

  it('falls back to demo only when no supabase map exists and demo is allowed', () => {
    const loaded = resolveMemoryMapBundleLoad('boishaai', null)
    expect(loaded?.source).toBe('demo')
    expect(loaded?.bundle.areas.some((a) => a.id === 'area-campus')).toBe(true)
  })

  it('does not fall back to demo when preferSupabase and supabase is configured', () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    const loaded = resolveMemoryMapBundleLoad('boishaai', null, { preferSupabase: true })
    expect(loaded).toBeNull()

    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey
  })
})

describe('loadContributorMemoryMapBundleBySlug', () => {
  it('returns missing for unknown slug when supabase is configured', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    const loaded = await loadContributorMemoryMapBundleBySlug('unknown-school-map')
    expect(loaded.kind).toBe('missing')
    if (loaded.kind === 'missing') {
      expect(loaded.reason).toBe('not_found')
    }

    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey
  })

  it('returns demo preview for boishaai when supabase is not configured', async () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(isSupabaseConfigured()).toBe(false)
    const loaded = await loadContributorMemoryMapBundleBySlug('boishaai')
    expect(loaded.kind).toBe('ready')
    if (loaded.kind === 'ready') {
      expect(loaded.source).toBe('demo')
      expect(loaded.bundle.areas.length).toBeGreaterThan(0)
    }

    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey
  })
})
