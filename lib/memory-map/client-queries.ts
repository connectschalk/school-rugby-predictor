import type { SupabaseClient } from '@supabase/supabase-js'
import { enrichBundle } from '@/lib/memory-map/demo-data'
import type { MemoryAuditLog, MemoryMap, MemoryMapBundle, MemoryStory, MemoryStoryMedia } from '@/lib/memory-map/types'

function parseMap(row: Record<string, unknown>, org: Record<string, unknown> | null): MemoryMap {
  return {
    id: String(row.id),
    organisation_id: String(row.organisation_id),
    title: String(row.title),
    slug: String(row.slug),
    tagline: row.tagline == null ? null : String(row.tagline),
    description: row.description == null ? null : String(row.description),
    visibility: row.visibility as MemoryMap['visibility'],
    status: row.status as MemoryMap['status'],
    profile_image_url: row.profile_image_url == null ? null : String(row.profile_image_url),
    landing_background_url: row.landing_background_url == null ? null : String(row.landing_background_url),
    primary_color: String(row.primary_color ?? '#FFD400'),
    primary_text_color: String(row.primary_text_color ?? '#050505'),
    secondary_color: String(row.secondary_color ?? 'transparent'),
    secondary_text_color: String(row.secondary_text_color ?? '#FFFFFF'),
    accent_color: String(row.accent_color ?? '#FFD400'),
    sponsor_name: row.sponsor_name == null ? null : String(row.sponsor_name),
    sponsor_logo_url: row.sponsor_logo_url == null ? null : String(row.sponsor_logo_url),
    sponsor_website_url: row.sponsor_website_url == null ? null : String(row.sponsor_website_url),
    sponsor_message: row.sponsor_message == null ? null : String(row.sponsor_message),
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

export async function attachStoryMediaAndTags(
  client: SupabaseClient,
  stories: MemoryStory[]
): Promise<MemoryStory[]> {
  if (stories.length === 0) return stories
  const ids = stories.map((s) => s.id)
  const [mediaRes, tagJoinRes] = await Promise.all([
    client.from('memory_story_media').select('*').in('story_id', ids).order('sort_order'),
    client.from('memory_story_tags').select('story_id, memory_tags(name)').in('story_id', ids),
  ])

  const mediaByStory = new Map<string, MemoryStoryMedia[]>()
  for (const m of mediaRes.data ?? []) {
    const sid = String(m.story_id)
    const list = mediaByStory.get(sid) ?? []
    list.push({
      id: String(m.id),
      story_id: sid,
      media_type: m.media_type as 'video' | 'image',
      file_url: String(m.file_url),
      thumbnail_url: m.thumbnail_url == null ? null : String(m.thumbnail_url),
      file_name: m.file_name == null ? null : String(m.file_name),
      sort_order: Number(m.sort_order ?? 0),
    })
    mediaByStory.set(sid, list)
  }

  const tagsByStory = new Map<string, string[]>()
  for (const row of tagJoinRes.data ?? []) {
    const sid = String(row.story_id)
    const tagObj = row.memory_tags as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(tagObj) ? tagObj[0]?.name : tagObj?.name
    if (!name) continue
    const list = tagsByStory.get(sid) ?? []
    list.push(String(name))
    tagsByStory.set(sid, list)
  }

  return stories.map((s) => ({
    ...s,
    media: mediaByStory.get(s.id) ?? [],
    tags: tagsByStory.get(s.id) ?? [],
  }))
}

/** Authenticated admin fetch — includes pending/rejected and all pin statuses. */
export async function fetchAdminMemoryMapBundleClient(
  client: SupabaseClient,
  mapId: string
): Promise<MemoryMapBundle | null> {
  const { data: map } = await client.from('memory_maps').select('*, organisations(*)').eq('id', mapId).maybeSingle()
  if (!map) return null

  const [areasRes, categoriesRes, tagsRes] = await Promise.all([
    client.from('memory_areas').select('*').eq('memory_map_id', mapId).order('sort_order'),
    client.from('memory_categories').select('*').eq('memory_map_id', mapId).order('sort_order'),
    client.from('memory_tags').select('id, name').eq('memory_map_id', mapId),
  ])

  const areaIds = (areasRes.data ?? []).map((a) => a.id as string)
  const { data: pins } = areaIds.length
    ? await client.from('memory_pins').select('*').in('area_id', areaIds)
    : { data: [] }

  const pinIds = (pins ?? []).map((p) => p.id as string)
  const { data: storiesRaw } = pinIds.length
    ? await client.from('memory_stories').select('*').in('pin_id', pinIds)
    : { data: [] }

  const stories = await attachStoryMediaAndTags(client, (storiesRaw ?? []) as MemoryStory[])
  const org = map.organisations as Record<string, unknown> | null

  return enrichBundle({
    map: parseMap(map as Record<string, unknown>, org),
    areas: (areasRes.data ?? []) as MemoryMapBundle['areas'],
    categories: (categoriesRes.data ?? []) as MemoryMapBundle['categories'],
    pins: (pins ?? []) as MemoryMapBundle['pins'],
    stories,
    tags: (tagsRes.data ?? []) as MemoryMapBundle['tags'],
  })
}

export async function fetchAuditLogs(
  client: SupabaseClient,
  mapId: string,
  limit = 50
): Promise<MemoryAuditLog[]> {
  const { data } = await client
    .from('memory_audit_logs')
    .select('*')
    .eq('memory_map_id', mapId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({
    id: String(row.id),
    memory_map_id: String(row.memory_map_id),
    actor_user_id: row.actor_user_id == null ? null : String(row.actor_user_id),
    action_type: String(row.action_type),
    entity_type: String(row.entity_type),
    entity_id: row.entity_id == null ? null : String(row.entity_id),
    reason: row.reason == null ? null : String(row.reason),
    created_at: String(row.created_at),
  }))
}

/** Public bundle with media/tags for approved stories only. */
export async function fetchPublicMemoryMapBundleClient(
  client: SupabaseClient,
  slug: string
): Promise<MemoryMapBundle | null> {
  const { data: map } = await client
    .from('memory_maps')
    .select('*, organisations(*)')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (!map) return null
  const mapId = String(map.id)

  const [areasRes, categoriesRes, tagsRes] = await Promise.all([
    client.from('memory_areas').select('*').eq('memory_map_id', mapId).eq('is_active', true).order('sort_order'),
    client.from('memory_categories').select('*').eq('memory_map_id', mapId).eq('is_active', true).order('sort_order'),
    client.from('memory_tags').select('id, name').eq('memory_map_id', mapId),
  ])

  const areaIds = (areasRes.data ?? []).map((a) => a.id as string)
  const { data: pins } = areaIds.length
    ? await client.from('memory_pins').select('*').in('area_id', areaIds).eq('status', 'approved')
    : { data: [] }

  const pinIds = (pins ?? []).map((p) => p.id as string)
  const { data: storiesRaw } = pinIds.length
    ? await client.from('memory_stories').select('*').in('pin_id', pinIds).eq('status', 'approved')
    : { data: [] }

  const stories = await attachStoryMediaAndTags(client, (storiesRaw ?? []) as MemoryStory[])
  const org = map.organisations as Record<string, unknown> | null

  return enrichBundle({
    map: parseMap(map as Record<string, unknown>, org),
    areas: (areasRes.data ?? []) as MemoryMapBundle['areas'],
    categories: (categoriesRes.data ?? []) as MemoryMapBundle['categories'],
    pins: (pins ?? []) as MemoryMapBundle['pins'],
    stories,
    tags: (tagsRes.data ?? []) as MemoryMapBundle['tags'],
  })
}
