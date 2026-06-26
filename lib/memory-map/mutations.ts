import type { SupabaseClient } from '@supabase/supabase-js'
import type { RiskLevel, StoryType, UploadMode } from '@/lib/memory-map/types'

export async function createMemoryAuditLog(
  client: SupabaseClient,
  input: {
    memoryMapId: string
    actionType: string
    entityType: string
    entityId?: string | null
    oldValue?: unknown
    newValue?: unknown
    reason?: string | null
  }
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await client.rpc('create_memory_audit_log', {
    p_memory_map_id: input.memoryMapId,
    p_action_type: input.actionType,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_old_value: input.oldValue ?? null,
    p_new_value: input.newValue ?? null,
    p_reason: input.reason ?? null,
  })
  if (error) return { id: null, error: error.message }
  return { id: data == null ? null : String(data), error: null }
}

export type StoryMediaPayload = {
  media_type: 'video' | 'image'
  file_url: string
  thumbnail_url?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  sort_order: number
}

export type SubmitStoryInput = {
  memoryMapId: string
  areaId: string
  existingPinId?: string | null
  pinTitle?: string
  pinDescription?: string
  pinCategoryId: string
  pinLat?: number | null
  pinLng?: number | null
  pinX?: number | null
  pinY?: number | null
  title: string
  description: string
  storyType: StoryType
  eventYear: number
  uploadMode: UploadMode
  riskLevel: RiskLevel
  loggedByDisplayName?: string
  hasPermissionConfirmed: boolean
  tags: string[]
  media: StoryMediaPayload[]
}

export async function submitMemoryStory(
  client: SupabaseClient,
  input: SubmitStoryInput
): Promise<{ storyId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('submit_memory_story', {
    p_memory_map_id: input.memoryMapId,
    p_area_id: input.areaId,
    p_existing_pin_id: input.existingPinId ?? null,
    p_pin_title: input.pinTitle ?? null,
    p_pin_description: input.pinDescription ?? null,
    p_pin_category_id: input.pinCategoryId,
    p_pin_lat: input.pinLat ?? null,
    p_pin_lng: input.pinLng ?? null,
    p_pin_x: input.pinX ?? null,
    p_pin_y: input.pinY ?? null,
    p_title: input.title,
    p_description: input.description,
    p_story_type: input.storyType,
    p_event_year: input.eventYear,
    p_upload_mode: input.uploadMode,
    p_risk_level: input.riskLevel,
    p_logged_by_display_name: input.loggedByDisplayName ?? null,
    p_has_permission_confirmed: input.hasPermissionConfirmed,
    p_tags: input.tags,
    p_media: input.media,
  })

  if (error) return { storyId: null, error: error.message }
  return { storyId: String(data), error: null }
}

export async function requestContributorAccess(
  client: SupabaseClient,
  memoryMapId: string,
  relationship: string,
  message: string
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('request_memory_map_contributor_access', {
    p_memory_map_id: memoryMapId,
    p_relationship: relationship || null,
    p_request_message: message || null,
  })
  return { error: error?.message ?? null }
}

export async function reviewMemoryMapMember(
  client: SupabaseClient,
  memberId: string,
  action: 'approve' | 'reject' | 'suspend',
  reason?: string
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('review_memory_map_member', {
    p_member_id: memberId,
    p_action: action,
    p_reason: reason ?? null,
  })
  return { error: error?.message ?? null }
}

export async function approveMemoryStory(client: SupabaseClient, storyId: string) {
  const { error } = await client.rpc('approve_memory_story', { p_story_id: storyId })
  return { error: error?.message ?? null }
}

export async function rejectMemoryStory(client: SupabaseClient, storyId: string, reason: string) {
  const { error } = await client.rpc('reject_memory_story', {
    p_story_id: storyId,
    p_reason: reason,
  })
  return { error: error?.message ?? null }
}

export async function moveMemoryPin(
  client: SupabaseClient,
  pinId: string,
  pos: { lat?: number | null; lng?: number | null; x?: number | null; y?: number | null }
) {
  const { error } = await client.rpc('move_memory_pin', {
    p_pin_id: pinId,
    p_lat: pos.lat ?? null,
    p_lng: pos.lng ?? null,
    p_x: pos.x ?? null,
    p_y: pos.y ?? null,
  })
  return { error: error?.message ?? null }
}

export async function moveMemoryStory(
  client: SupabaseClient,
  storyId: string,
  destinationPinId: string | null,
  newPin?: Record<string, unknown> | null
) {
  const { error } = await client.rpc('move_memory_story', {
    p_story_id: storyId,
    p_destination_pin_id: destinationPinId,
    p_new_pin: newPin ?? null,
  })
  return { error: error?.message ?? null }
}

export async function setMemoryStoryStatus(
  client: SupabaseClient,
  storyId: string,
  status: 'archived' | 'deleted',
  reason?: string
) {
  const { error } = await client.rpc('set_memory_story_status', {
    p_story_id: storyId,
    p_status: status,
    p_reason: reason ?? null,
  })
  return { error: error?.message ?? null }
}

export async function setMemoryPinStatus(
  client: SupabaseClient,
  pinId: string,
  status: 'archived' | 'deleted',
  storyAction: 'none' | 'move' | 'archive_stories' | 'delete_stories',
  moveStoriesToPinId?: string | null,
  reason?: string
) {
  const { error } = await client.rpc('set_memory_pin_status', {
    p_pin_id: pinId,
    p_status: status,
    p_story_action: storyAction,
    p_move_stories_to_pin_id: moveStoriesToPinId ?? null,
    p_reason: reason ?? null,
  })
  return { error: error?.message ?? null }
}

export async function updateMemoryMapBranding(
  client: SupabaseClient,
  mapId: string,
  fields: {
    title: string
    tagline: string
    profile_image_url: string
    landing_background_url: string
    primary_color: string
    primary_text_color: string
    secondary_color: string
    secondary_text_color: string
    accent_color: string
  }
) {
  const { error } = await client.rpc('update_memory_map_branding', {
    p_map_id: mapId,
    p_title: fields.title,
    p_tagline: fields.tagline,
    p_profile_image_url: fields.profile_image_url,
    p_landing_background_url: fields.landing_background_url,
    p_primary_color: fields.primary_color,
    p_primary_text_color: fields.primary_text_color,
    p_secondary_color: fields.secondary_color,
    p_secondary_text_color: fields.secondary_text_color,
    p_accent_color: fields.accent_color,
  })
  return { error: error?.message ?? null }
}

export async function updateMemoryMapSponsor(
  client: SupabaseClient,
  mapId: string,
  fields: {
    sponsor_name: string
    sponsor_logo_url: string
    sponsor_website_url: string
    sponsor_message: string
  }
) {
  const { error } = await client.rpc('update_memory_map_sponsor', {
    p_map_id: mapId,
    p_sponsor_name: fields.sponsor_name,
    p_sponsor_logo_url: fields.sponsor_logo_url,
    p_sponsor_website_url: fields.sponsor_website_url,
    p_sponsor_message: fields.sponsor_message,
  })
  return { error: error?.message ?? null }
}
