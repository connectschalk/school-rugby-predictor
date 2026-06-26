import { unstable_noStore as noStore } from 'next/cache'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { attachStoryMediaAndTags } from '@/lib/memory-map/client-queries'
import { enrichBundle, getDemoBundle } from '@/lib/memory-map/demo-data'
import type { MemoryMap, MemoryMapBundle, MemoryStory } from '@/lib/memory-map/types'

export type MemoryMapDataSource = 'supabase' | 'demo'

export function createMemoryMapServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function logBundleSource(slug: string, source: MemoryMapDataSource, detail?: string) {
  if (process.env.NODE_ENV === 'development') {
    console.info(`[memory-map] bundle ${slug} source=${source}${detail ? ` (${detail})` : ''}`)
  }
}

export function mapRecordToMemoryMap(map: Record<string, unknown>): MemoryMap {
  const org = map.organisations as Record<string, unknown> | null
  return {
    id: String(map.id),
    organisation_id: String(map.organisation_id),
    title: String(map.title),
    slug: String(map.slug),
    tagline: map.tagline == null ? null : String(map.tagline),
    description: map.description == null ? null : String(map.description),
    visibility: map.visibility as MemoryMap['visibility'],
    status: map.status as MemoryMap['status'],
    profile_image_url: map.profile_image_url == null ? null : String(map.profile_image_url),
    landing_background_url: map.landing_background_url == null ? null : String(map.landing_background_url),
    primary_color: String(map.primary_color ?? '#FFD400'),
    primary_text_color: String(map.primary_text_color ?? '#050505'),
    secondary_color: String(map.secondary_color ?? 'transparent'),
    secondary_text_color: String(map.secondary_text_color ?? '#FFFFFF'),
    accent_color: String(map.accent_color ?? '#FFD400'),
    default_lat: map.default_lat == null ? null : Number(map.default_lat),
    default_lng: map.default_lng == null ? null : Number(map.default_lng),
    default_zoom: map.default_zoom == null ? null : Number(map.default_zoom),
    sponsor_name: map.sponsor_name == null ? null : String(map.sponsor_name),
    sponsor_logo_url: map.sponsor_logo_url == null ? null : String(map.sponsor_logo_url),
    sponsor_website_url: map.sponsor_website_url == null ? null : String(map.sponsor_website_url),
    sponsor_message: map.sponsor_message == null ? null : String(map.sponsor_message),
    organisation: org
      ? {
          id: String(org.id),
          name: String(org.name),
          slug: String(org.slug),
          type: org.type as MemoryMap['organisation'] extends infer O
            ? O extends { type: infer T }
              ? T
              : never
            : never,
          logo_url: org.logo_url == null ? null : String(org.logo_url),
          description: org.description == null ? null : String(org.description),
        }
      : undefined,
  }
}

/** Never merge demo content over a real Supabase map row. */
export function resolvePublicMemoryMapBundle(
  slug: string,
  supabaseMap: Record<string, unknown> | null,
  related: Omit<MemoryMapBundle, 'map'>
): { source: MemoryMapDataSource; bundle: MemoryMapBundle } | null {
  if (!supabaseMap) return null
  return {
    source: 'supabase',
    bundle: {
      map: mapRecordToMemoryMap(supabaseMap),
      areas: related.areas,
      categories: related.categories,
      pins: related.pins,
      stories: related.stories,
      tags: related.tags,
    },
  }
}

export async function fetchMemoryMapBundleBySlug(slug: string): Promise<MemoryMapBundle | null> {
  noStore()
  const demo = getDemoBundle(slug)
  const client = createMemoryMapServerClient()
  if (!client) {
    logBundleSource(slug, 'demo', 'no supabase client')
    return demo ? enrichBundle(demo) : null
  }

  try {
    const { data: map, error } = await client
      .from('memory_maps')
      .select('*, organisations(*)')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      logBundleSource(slug, 'demo', `query error: ${error.message}`)
      return demo ? enrichBundle(demo) : null
    }

    if (!map) {
      logBundleSource(slug, 'demo', 'no active map row')
      return demo ? enrichBundle(demo) : null
    }

    const mapId = map.id as string
    const { data: allAreaRows } = await client.from('memory_areas').select('id').eq('memory_map_id', mapId)
    const areaIds = (allAreaRows ?? []).map((a: { id: string }) => a.id)

    const [areasRes, categoriesRes, tagsRes] = await Promise.all([
      client.from('memory_areas').select('*').eq('memory_map_id', mapId).eq('is_active', true).order('sort_order'),
      client.from('memory_categories').select('*').eq('memory_map_id', mapId).eq('is_active', true).order('sort_order'),
      client.from('memory_tags').select('id, name').eq('memory_map_id', mapId),
    ])

    const pinsRes = areaIds.length
      ? await client.from('memory_pins').select('*').in('area_id', areaIds).eq('status', 'approved')
      : { data: [] as MemoryMapBundle['pins'] }

    const pinIds = (pinsRes.data ?? []).map((p: { id: string }) => p.id)
    const storiesRes = pinIds.length
      ? await client.from('memory_stories').select('*').in('pin_id', pinIds).eq('status', 'approved')
      : { data: [] as MemoryStory[] }

    const stories = await attachStoryMediaAndTags(client, (storiesRes.data ?? []) as MemoryStory[])

    const resolved = resolvePublicMemoryMapBundle(slug, map as Record<string, unknown>, {
      areas: (areasRes.data ?? []) as MemoryMapBundle['areas'],
      categories: (categoriesRes.data ?? []) as MemoryMapBundle['categories'],
      pins: (pinsRes.data ?? []) as MemoryMapBundle['pins'],
      stories,
      tags: (tagsRes.data ?? []) as MemoryMapBundle['tags'],
    })

    if (!resolved) {
      logBundleSource(slug, 'demo', 'resolve failed')
      return demo ? enrichBundle(demo) : null
    }

    logBundleSource(slug, 'supabase')
    return enrichBundle(resolved.bundle)
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[memory-map] fetch failed for ${slug}:`, e)
    }
    logBundleSource(slug, 'demo', 'exception')
    return demo ? enrichBundle(demo) : null
  }
}

export async function fetchAdminMemoryMapBundle(mapId: string): Promise<MemoryMapBundle | null> {
  noStore()
  const demo = getDemoBundle('boishaai')
  const client = createMemoryMapServerClient()
  if (!client) return demo ? enrichBundle({ ...demo, stories: demo.stories }) : null

  try {
    const { data: map } = await client.from('memory_maps').select('*, organisations(*)').eq('id', mapId).maybeSingle()
    if (!map) return demo && demo.map.id === mapId ? enrichBundle(demo) : null

    const [areasRes, categoriesRes, tagsRes] = await Promise.all([
      client.from('memory_areas').select('*').eq('memory_map_id', mapId).order('sort_order'),
      client.from('memory_categories').select('*').eq('memory_map_id', mapId).order('sort_order'),
      client.from('memory_tags').select('id, name').eq('memory_map_id', mapId),
    ])

    const areaIds = (areasRes.data ?? []).map((a: { id: string }) => a.id)
    const { data: pins } = areaIds.length
      ? await client.from('memory_pins').select('*').in('area_id', areaIds)
      : { data: [] }

    const pinIds = (pins ?? []).map((p: { id: string }) => p.id)
    const { data: stories } = pinIds.length
      ? await client.from('memory_stories').select('*').in('pin_id', pinIds)
      : { data: [] }

    return enrichBundle({
      map: mapRecordToMemoryMap(map as Record<string, unknown>),
      areas: (areasRes.data ?? []) as MemoryMapBundle['areas'],
      categories: (categoriesRes.data ?? []) as MemoryMapBundle['categories'],
      pins: (pins ?? []) as MemoryMapBundle['pins'],
      stories: (stories ?? []) as MemoryStory[],
      tags: (tagsRes.data ?? []) as MemoryMapBundle['tags'],
    })
  } catch {
    return demo && demo.map.id === mapId ? enrichBundle(demo) : null
  }
}

export function memoryMapPublicUrl(slug: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/memory-map/${slug}`
}
