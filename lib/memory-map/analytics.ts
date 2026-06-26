import type { SupabaseClient } from '@supabase/supabase-js'

const ANON_KEY = 'mm_anon_id'

export type MemoryMapEventType =
  | 'map_landing_viewed'
  | 'map_opened'
  | 'area_selected'
  | 'pin_opened'
  | 'story_opened'
  | 'add_memory_started'
  | 'story_submitted'
  | 'qr_link_opened'
  | 'contributor_request_submitted'

export function getMemoryMapAnonymousId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(ANON_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

export async function trackMemoryMapEvent(
  client: SupabaseClient,
  input: {
    memoryMapId: string
    eventType: MemoryMapEventType
    areaId?: string | null
    pinId?: string | null
    storyId?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    await client.rpc('track_memory_map_event', {
      p_memory_map_id: input.memoryMapId,
      p_event_type: input.eventType,
      p_area_id: input.areaId ?? null,
      p_pin_id: input.pinId ?? null,
      p_story_id: input.storyId ?? null,
      p_anonymous_id: getMemoryMapAnonymousId() || null,
      p_metadata: input.metadata ?? null,
    })
  } catch {
    /* analytics must not break UX */
  }
}

export type MemoryMapAnalyticsSummary = {
  landing_views: number
  map_opens: number
  story_opens: number
  pin_opens: number
  contributor_requests: number
  story_submissions: number
}

export async function fetchMemoryMapAnalytics(
  client: SupabaseClient,
  mapId: string,
  days = 30
): Promise<MemoryMapAnalyticsSummary | null> {
  const { data, error } = await client.rpc('memory_map_analytics_summary', {
    p_map_id: mapId,
    p_days: days,
  })
  if (error || !data) return null
  const d = data as Record<string, number>
  return {
    landing_views: Number(d.landing_views ?? 0),
    map_opens: Number(d.map_opens ?? 0),
    story_opens: Number(d.story_opens ?? 0),
    pin_opens: Number(d.pin_opens ?? 0),
    contributor_requests: Number(d.contributor_requests ?? 0),
    story_submissions: Number(d.story_submissions ?? 0),
  }
}
