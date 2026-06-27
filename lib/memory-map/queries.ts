import { unstable_noStore as noStore } from 'next/cache'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { attachStoryMediaAndTags } from '@/lib/memory-map/client-queries'
import { enrichBundle, getDemoBundle } from '@/lib/memory-map/demo-data'
import type { MemoryMap, MemoryMapBundle, MemoryStory } from '@/lib/memory-map/types'

export type MemoryMapDataSource = 'supabase' | 'demo'

export type LoadedMemoryMapBundle = {
  source: MemoryMapDataSource
  bundle: MemoryMapBundle
}

export type ContributorMemoryMapLoad =
  | { kind: 'ready'; source: MemoryMapDataSource; bundle: MemoryMapBundle }
  | { kind: 'missing'; slug: string; reason: 'not_found' | 'private' }

/** Active maps reachable by direct URL (public directory + link-only). */
export function memoryMapAllowsDirectPublicAccess(
  map: Pick<MemoryMap, 'status' | 'visibility'>
): boolean {
  return map.status === 'active' && (map.visibility === 'public' || map.visibility === 'link_only')
}

/** Draft link-only/public maps resolve for unavailable shell (not full content). */
export function memoryMapAllowsDirectPublicShell(
  map: Pick<MemoryMap, 'status' | 'visibility'>
): boolean {
  if (map.visibility !== 'public' && map.visibility !== 'link_only') return false
  return map.status === 'draft' || memoryMapAllowsDirectPublicAccess(map)
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function createMemoryMapServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

/** Server-only fallback when anon RLS blocks a valid public/link_only slug lookup. */
export function createMemoryMapServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type PublicMemoryMapLoad =
  | { kind: 'ready'; source: MemoryMapDataSource; bundle: MemoryMapBundle }
  | { kind: 'private'; slug: string; map: MemoryMap }
  | { kind: 'not_found'; slug: string }

type FetchSlugResult =
  | { outcome: 'found'; map: Record<string, unknown>; related: Omit<MemoryMapBundle, 'map'> }
  | { outcome: 'private'; map: MemoryMap }
  | { outcome: 'missing' }

export function logSlugResolve(slug: string, load: PublicMemoryMapLoad): void {
  if (process.env.NODE_ENV !== 'development') return
  const memoryMap = load.kind === 'ready' ? load.bundle.map : load.kind === 'private' ? load.map : undefined
  console.log('[memory-map:slug-resolve]', {
    slug,
    found: Boolean(memoryMap),
    status: memoryMap?.status,
    visibility: memoryMap?.visibility,
    source: load.kind === 'ready' ? load.source : load.kind,
  })
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
  const map = mapRecordToMemoryMap(supabaseMap)
  if (!memoryMapAllowsDirectPublicShell(map)) return null
  return {
    source: 'supabase',
    bundle: {
      map,
      areas: related.areas,
      categories: related.categories,
      pins: related.pins,
      stories: related.stories,
      tags: related.tags,
    },
  }
}

async function attachOrganisationToMapRow(
  client: SupabaseClient,
  mapRow: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const orgId = mapRow.organisation_id
  if (!orgId) return { ...mapRow, organisations: null }
  const { data: org } = await client.from('organisations').select('*').eq('id', orgId).maybeSingle()
  return { ...mapRow, organisations: org ?? null }
}

async function fetchMapRelatedData(
  client: SupabaseClient,
  mapId: string
): Promise<Omit<MemoryMapBundle, 'map'>> {
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

  return {
    areas: (areasRes.data ?? []) as MemoryMapBundle['areas'],
    categories: (categoriesRes.data ?? []) as MemoryMapBundle['categories'],
    pins: (pinsRes.data ?? []) as MemoryMapBundle['pins'],
    stories,
    tags: (tagsRes.data ?? []) as MemoryMapBundle['tags'],
  }
}

async function fetchMemoryMapRowBySlug(
  client: SupabaseClient,
  slug: string,
  options?: { includePrivate?: boolean; bypassVisibilityFilter?: boolean }
): Promise<Record<string, unknown> | null> {
  let query = client.from('memory_maps').select('*').eq('slug', slug)

  if (!options?.bypassVisibilityFilter) {
    if (options?.includePrivate) {
      query = query.in('status', ['active', 'draft'])
    } else {
      query = query.eq('status', 'active').in('visibility', ['public', 'link_only'])
    }
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[memory-map] slug row lookup failed for ${slug}:`, error.message)
    }
    return null
  }
  return (data as Record<string, unknown> | null) ?? null
}

function classifyFetchedMapForPublicRoute(
  map: MemoryMap,
  options?: { includePrivate?: boolean }
): 'found' | 'private' | 'missing' {
  if (map.status === 'archived') return 'missing'
  if (map.visibility === 'private') {
    if (options?.includePrivate && (map.status === 'active' || map.status === 'draft')) return 'found'
    if (map.status === 'active' || map.status === 'draft') return 'private'
    return 'missing'
  }
  if (memoryMapAllowsDirectPublicShell(map)) return 'found'
  return 'missing'
}

async function fetchSupabaseBundleBySlug(
  slug: string,
  options?: { includePrivate?: boolean }
): Promise<FetchSlugResult> {
  const anon = createMemoryMapServerClient()
  const service = createMemoryMapServiceRoleClient()
  const clients = [anon, service].filter(Boolean) as SupabaseClient[]

  if (clients.length === 0) return { outcome: 'missing' }

  try {
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i]!
      const bypassVisibilityFilter = i > 0 && client === service
      const mapRow = await fetchMemoryMapRowBySlug(client, slug, {
        ...options,
        bypassVisibilityFilter,
      })
      if (!mapRow) continue

      const mapWithOrg = await attachOrganisationToMapRow(client, mapRow)
      const map = mapRecordToMemoryMap(mapWithOrg)
      const classification = classifyFetchedMapForPublicRoute(map, options)

      if (classification === 'private') {
        return { outcome: 'private', map }
      }
      if (classification === 'missing') {
        continue
      }

      const related = await fetchMapRelatedData(client, map.id)
      return { outcome: 'found', map: mapWithOrg, related }
    }

    return { outcome: 'missing' }
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[memory-map] supabase fetch failed for ${slug}:`, e)
    }
    return { outcome: 'missing' }
  }
}

export type ResolveMemoryMapBundleOptions = {
  /** When true, never return in-memory demo if Supabase env is configured. */
  preferSupabase?: boolean
}

/** Never mix demo areas/pins when a real Supabase map row exists. */
export function resolveMemoryMapBundleLoad(
  slug: string,
  supabase: { map: Record<string, unknown>; related: Omit<MemoryMapBundle, 'map'> } | null,
  options?: ResolveMemoryMapBundleOptions
): LoadedMemoryMapBundle | null {
  if (supabase) {
    const resolved = resolvePublicMemoryMapBundle(slug, supabase.map, supabase.related)
    if (resolved) {
      return { source: 'supabase', bundle: enrichBundle(resolved.bundle) }
    }
  }

  const supabaseConfigured = isSupabaseConfigured()
  const allowDemo = !(options?.preferSupabase && supabaseConfigured)

  if (!allowDemo) return null

  const demo = getDemoBundle(slug)
  if (demo) {
    return { source: 'demo', bundle: enrichBundle(demo) }
  }

  return null
}

/** Contributor/add route: includes private maps when RLS allows member access. */
export function resolveContributorMemoryMapBundle(
  slug: string,
  supabaseMap: Record<string, unknown> | null,
  related: Omit<MemoryMapBundle, 'map'>
): { source: MemoryMapDataSource; bundle: MemoryMapBundle } | null {
  if (!supabaseMap) return null
  const map = mapRecordToMemoryMap(supabaseMap)
  if (map.status === 'archived') return null
  if (map.visibility === 'private') {
    if (map.status !== 'active' && map.status !== 'draft') return null
  } else if (!memoryMapAllowsDirectPublicShell(map)) {
    return null
  }
  return {
    source: 'supabase',
    bundle: {
      map,
      areas: related.areas,
      categories: related.categories,
      pins: related.pins,
      stories: related.stories,
      tags: related.tags,
    },
  }
}

export async function loadPublicMemoryMapBySlug(slug: string): Promise<PublicMemoryMapLoad> {
  noStore()
  const slugNorm = slug.trim()
  const fetched = await fetchSupabaseBundleBySlug(slugNorm)

  if (fetched.outcome === 'private') {
    const result: PublicMemoryMapLoad = { kind: 'private', slug: slugNorm, map: fetched.map }
    logSlugResolve(slugNorm, result)
    return result
  }

  if (fetched.outcome === 'found') {
    const resolved = resolvePublicMemoryMapBundle(slugNorm, fetched.map, fetched.related)
    if (resolved) {
      const result: PublicMemoryMapLoad = {
        kind: 'ready',
        source: 'supabase',
        bundle: enrichBundle(resolved.bundle),
      }
      logSlugResolve(slugNorm, result)
      return result
    }
  }

  if (!isSupabaseConfigured()) {
    const demo = getDemoBundle(slugNorm)
    if (demo) {
      const result: PublicMemoryMapLoad = { kind: 'ready', source: 'demo', bundle: enrichBundle(demo) }
      logSlugResolve(slugNorm, result)
      return result
    }
  }

  const result: PublicMemoryMapLoad = { kind: 'not_found', slug: slugNorm }
  logSlugResolve(slugNorm, result)
  return result
}

export async function loadMemoryMapBundleBySlug(
  slug: string,
  options?: ResolveMemoryMapBundleOptions
): Promise<LoadedMemoryMapBundle | null> {
  noStore()
  const fetched = await fetchSupabaseBundleBySlug(slug)
  const supabase =
    fetched.outcome === 'found' ? { map: fetched.map, related: fetched.related } : null
  const loaded = resolveMemoryMapBundleLoad(slug, supabase, options)
  if (loaded) {
    logBundleSource(slug, loaded.source, loaded.source === 'demo' ? 'no supabase map' : undefined)
  }
  return loaded
}

/** Add Memory route: prefer live Supabase data; never return null (no generic 404). */
export async function loadContributorMemoryMapBundleBySlug(slug: string): Promise<ContributorMemoryMapLoad> {
  noStore()

  if (process.env.NODE_ENV === 'development') {
    console.info('[memory-map:add] supabase configured', isSupabaseConfigured(), 'slug', slug)
  }

  const fetched = await fetchSupabaseBundleBySlug(slug, { includePrivate: true })
  if (fetched.outcome === 'found') {
    const resolved = resolveContributorMemoryMapBundle(slug, fetched.map, fetched.related)
    if (resolved) {
      logBundleSource(slug, 'supabase')
      return { kind: 'ready', source: 'supabase', bundle: enrichBundle(resolved.bundle) }
    }
  }
  if (fetched.outcome === 'private') {
    return { kind: 'missing', slug, reason: 'private' }
  }

  if (!isSupabaseConfigured()) {
    const demo = getDemoBundle(slug)
    if (demo) {
      logBundleSource(slug, 'demo', 'offline preview')
      return { kind: 'ready', source: 'demo', bundle: enrichBundle(demo) }
    }
    return { kind: 'missing', slug, reason: 'not_found' }
  }

  // Supabase is configured but no live row — use demo preview for known demo slugs
  // so Add Memory matches the landing page while DB setup is pending.
  const demo = getDemoBundle(slug)
  if (demo) {
    logBundleSource(slug, 'demo', 'no live row')
    return { kind: 'ready', source: 'demo', bundle: enrichBundle(demo) }
  }

  return { kind: 'missing', slug, reason: 'not_found' }
}

export async function fetchMemoryMapBundleBySlug(slug: string): Promise<MemoryMapBundle | null> {
  const loaded = await loadPublicMemoryMapBySlug(slug)
  return loaded.kind === 'ready' ? loaded.bundle : null
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
