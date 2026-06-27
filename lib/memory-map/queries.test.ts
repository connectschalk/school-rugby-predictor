import { describe, expect, it, vi } from 'vitest'
import {
  resolveMemoryMapBundleLoad,
  resolvePublicMemoryMapBundle,
  memoryMapAllowsDirectPublicAccess,
  memoryMapAllowsDirectPublicShell,
  loadContributorMemoryMapBundleBySlug,
  logSlugResolve,
  isSupabaseConfigured,
} from './queries'

describe('memoryMapAllowsDirectPublicAccess', () => {
  it('allows active public and link_only maps', () => {
    expect(memoryMapAllowsDirectPublicAccess({ status: 'active', visibility: 'public' })).toBe(true)
    expect(memoryMapAllowsDirectPublicAccess({ status: 'active', visibility: 'link_only' })).toBe(true)
  })

  it('blocks draft, archived, and private maps', () => {
    expect(memoryMapAllowsDirectPublicAccess({ status: 'draft', visibility: 'link_only' })).toBe(false)
    expect(memoryMapAllowsDirectPublicAccess({ status: 'archived', visibility: 'public' })).toBe(false)
    expect(memoryMapAllowsDirectPublicAccess({ status: 'active', visibility: 'private' })).toBe(false)
  })
})

describe('memoryMapAllowsDirectPublicShell', () => {
  it('allows draft link_only/public shells', () => {
    expect(memoryMapAllowsDirectPublicShell({ status: 'draft', visibility: 'link_only' })).toBe(true)
  })
})

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

  it('returns null for private maps on public direct-link routes', () => {
    const result = resolvePublicMemoryMapBundle(
      'secret',
      { ...supabaseMap, visibility: 'private' },
      { areas: [], categories: [], pins: [], stories: [], tags: [] }
    )
    expect(result).toBeNull()
  })

  it('resolves active link_only maps with zero content', () => {
    const result = resolvePublicMemoryMapBundle('van-der-merwe', supabaseMap, {
      areas: [],
      categories: [],
      pins: [],
      stories: [],
      tags: [],
    })
    expect(result?.bundle.map.slug).toBe('boishaai')
    expect(result?.bundle.areas).toHaveLength(0)
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

describe('loadPublicMemoryMapBySlug', () => {
  it('logs slug resolution in development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    logSlugResolve('van-der-merwe', {
      kind: 'ready',
      source: 'supabase',
      bundle: {
        map: {
          id: '6976fcac-be56-4d52-bcdd-9c2651f4c3ff',
          organisation_id: 'org-1',
          title: 'Paarl van der Merwes',
          slug: 'van-der-merwe',
          tagline: null,
          description: null,
          visibility: 'link_only',
          status: 'active',
          profile_image_url: null,
          landing_background_url: null,
          primary_color: '#FFD400',
          primary_text_color: '#050505',
          secondary_color: 'transparent',
          secondary_text_color: '#FFFFFF',
          accent_color: '#FFD400',
          default_lat: null,
          default_lng: null,
          default_zoom: null,
          sponsor_name: null,
          sponsor_logo_url: null,
          sponsor_website_url: null,
          sponsor_message: null,
        },
        areas: [],
        categories: [],
        pins: [],
        stories: [],
        tags: [],
      },
    })

    expect(log).toHaveBeenCalledWith('[memory-map:slug-resolve]', {
      slug: 'van-der-merwe',
      found: true,
      status: 'active',
      visibility: 'link_only',
      source: 'supabase',
    })

    log.mockRestore()
    process.env.NODE_ENV = prev
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
