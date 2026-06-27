import { DEMO_MAP_SLUG } from '@/lib/memory-map/constants'
import { mapRecordToMemoryMap, createMemoryMapServerClient, isSupabaseConfigured } from '@/lib/memory-map/queries'
import {
  buildFallbackDirectory,
  getDemoDirectoryEntry,
  type MemoryMapDirectoryEntry,
  type PublicMemoryMapDirectory,
} from '@/lib/memory-map/directory-types'

export type {
  DirectoryOrganisationFilter,
  MemoryMapDirectoryEntry,
  PublicMemoryMapDirectory,
} from '@/lib/memory-map/directory-types'

/** Only `public` maps appear in /memory-map/find; link_only maps use direct URLs. */
export function shouldIncludeInPublicDirectory(visibility: string): boolean {
  return visibility === 'public'
}

export {
  MEMORY_MAP_PRODUCT_HEADLINE,
  MEMORY_MAP_PRODUCT_SUBHEADLINE,
  MEMORY_MAP_TAGLINE,
  filterDirectoryEntries,
  getDemoDirectoryEntry,
  organisationTypeLabel,
} from '@/lib/memory-map/directory-types'

function entryFromMapRow(
  map: Record<string, unknown>,
  counts: { areas: number; pins: number; stories: number }
): MemoryMapDirectoryEntry {
  const parsed = mapRecordToMemoryMap(map)
  const org = parsed.organisation
  return {
    id: parsed.id,
    slug: parsed.slug,
    title: parsed.title,
    tagline: parsed.tagline,
    description: parsed.description,
    visibility: parsed.visibility,
    profileImageUrl: parsed.profile_image_url,
    landingBackgroundUrl: parsed.landing_background_url,
    sponsorName: parsed.sponsor_name,
    sponsorLogoUrl: parsed.sponsor_logo_url,
    organisationName: org?.name ?? parsed.title,
    organisationType: org?.type ?? 'school',
    organisationLogoUrl: org?.logo_url ?? null,
    areaCount: counts.areas,
    pinCount: counts.pins,
    storyCount: counts.stories,
    source: 'supabase',
    isDemoPreview: false,
  }
}

async function fetchSupabaseDirectoryEntries(): Promise<{
  entries: MemoryMapDirectoryEntry[]
  queryFailed: boolean
}> {
  const client = createMemoryMapServerClient()
  if (!client) return { entries: [], queryFailed: false }

  const { data: maps, error } = await client
    .from('memory_maps')
    .select('*, organisations(*)')
    .eq('status', 'active')
    .eq('visibility', 'public')
    .order('title')

  if (error) {
    console.error('[memory-map:directory] maps query failed', error.message)
    return { entries: [], queryFailed: true }
  }
  if (!maps?.length) return { entries: [], queryFailed: false }

  const mapIds = maps.map((m) => String(m.id))

  const { data: areaRows, error: areaError } = await client
    .from('memory_areas')
    .select('id, memory_map_id')
    .in('memory_map_id', mapIds)
    .eq('is_active', true)

  if (areaError) {
    console.error('[memory-map:directory] areas query failed', areaError.message)
    return {
      entries: maps.map((map) =>
        entryFromMapRow(map as Record<string, unknown>, { areas: 0, pins: 0, stories: 0 })
      ),
      queryFailed: true,
    }
  }

  const areasByMap = new Map<string, string[]>()
  for (const row of areaRows ?? []) {
    const mapId = String(row.memory_map_id)
    const list = areasByMap.get(mapId) ?? []
    list.push(String(row.id))
    areasByMap.set(mapId, list)
  }

  const allAreaIds = (areaRows ?? []).map((r) => String(r.id))
  const { data: pinRows } = allAreaIds.length
    ? await client
        .from('memory_pins')
        .select('id, area_id')
        .in('area_id', allAreaIds)
        .eq('status', 'approved')
    : { data: [] as { id: string; area_id: string }[] }

  const areaToMap = new Map<string, string>()
  for (const [mapId, areaIds] of areasByMap) {
    for (const areaId of areaIds) areaToMap.set(areaId, mapId)
  }

  const pinsByMap = new Map<string, string[]>()
  for (const pin of pinRows ?? []) {
    const mapId = areaToMap.get(String(pin.area_id))
    if (!mapId) continue
    const list = pinsByMap.get(mapId) ?? []
    list.push(String(pin.id))
    pinsByMap.set(mapId, list)
  }

  const allPinIds = (pinRows ?? []).map((p) => String(p.id))
  const { data: storyRows } = allPinIds.length
    ? await client
        .from('memory_stories')
        .select('id, pin_id')
        .in('pin_id', allPinIds)
        .eq('status', 'approved')
    : { data: [] as { id: string; pin_id: string }[] }

  const pinToMap = new Map<string, string>()
  for (const [mapId, pinIds] of pinsByMap) {
    for (const pinId of pinIds) pinToMap.set(pinId, mapId)
  }

  const storiesByMap = new Map<string, number>()
  for (const story of storyRows ?? []) {
    const mapId = pinToMap.get(String(story.pin_id))
    if (!mapId) continue
    storiesByMap.set(mapId, (storiesByMap.get(mapId) ?? 0) + 1)
  }

  return {
    entries: maps.map((map) => {
      const mapId = String(map.id)
      const areaIds = areasByMap.get(mapId) ?? []
      const pinIds = pinsByMap.get(mapId) ?? []
      return entryFromMapRow(map as Record<string, unknown>, {
        areas: areaIds.length,
        pins: pinIds.length,
        stories: storiesByMap.get(mapId) ?? 0,
      })
    }),
    queryFailed: false,
  }
}

/** Public directory for product landing — never throws; falls back to demo on error. */
export async function fetchPublicMemoryMapDirectory(): Promise<PublicMemoryMapDirectory> {
  try {
    if (!isSupabaseConfigured()) {
      return buildFallbackDirectory()
    }

    const { entries: liveEntries, queryFailed } = await fetchSupabaseDirectoryEntries()
    if (queryFailed) {
      return buildFallbackDirectory(true)
    }

    const hasLiveBoishaai = liveEntries.some((e) => e.slug === DEMO_MAP_SLUG)
    const demoEntry = hasLiveBoishaai ? null : getDemoDirectoryEntry()
    return {
      liveEntries,
      demoEntry,
      dataSource: liveEntries.length > 0 ? 'supabase' : 'demo',
    }
  } catch (error) {
    console.error('[memory-map:directory] failed to load', error)
    return buildFallbackDirectory(true)
  }
}
