import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeApprovalError } from '@/lib/memory-map/own-story-approval'
import type { MemoryMapDataSource } from '@/lib/memory-map/queries'
import { contributorGovernanceRpcParams } from '@/lib/memory-map/submit-governance'
import { validateMemoryMapSubmitIds } from '@/lib/memory-map/submit-ids'
import type { RiskLevel, StoryStatus, StoryType, UploadMode } from '@/lib/memory-map/types'

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
  dataSource?: MemoryMapDataSource
  existingPinId?: string | null
  pinTitle?: string
  pinDescription?: string
  pinCategoryId: string | null
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
  containsMinors?: boolean
  mentionsFullNames?: boolean
  showsInjury?: boolean
  isArchiveContent?: boolean
  sponsorOrBrandVisible?: boolean
  tags: string[]
  media: StoryMediaPayload[]
}

export type AdminCreateStoryInput = {
  memoryMapId: string
  areaId: string
  existingPinId?: string | null
  createNewPin: boolean
  pinTitle?: string
  pinDescription?: string
  pinCategoryId: string | null
  pinLat?: number | null
  pinLng?: number | null
  pinX?: number | null
  pinY?: number | null
  title: string
  description: string
  storyType: StoryType
  eventYear: number
  eventDate?: string | null
  uploadMode: UploadMode
  riskLevel: RiskLevel
  loggedByDisplayName?: string
  isOfficial: boolean
  pinIsOfficial: boolean
  status: StoryStatus
  governanceFlags: Record<string, unknown>
  tags: string[]
  media: StoryMediaPayload[]
}

export async function adminCreateMemoryStory(
  client: SupabaseClient,
  input: AdminCreateStoryInput
): Promise<{ storyId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('admin_create_memory_story', {
    p_memory_map_id: input.memoryMapId,
    p_area_id: input.areaId,
    p_existing_pin_id: input.existingPinId ?? null,
    p_create_new_pin: input.createNewPin,
    p_pin_title: input.pinTitle ?? null,
    p_pin_description: input.pinDescription ?? null,
    p_pin_category_id: input.pinCategoryId ?? null,
    p_pin_lat: input.pinLat ?? null,
    p_pin_lng: input.pinLng ?? null,
    p_pin_x_position: input.pinX ?? null,
    p_pin_y_position: input.pinY ?? null,
    p_story_title: input.title,
    p_story_description: input.description,
    p_event_year: input.eventYear,
    p_event_date: input.eventDate ?? null,
    p_category_id: input.pinCategoryId ?? null,
    p_tags: input.tags,
    p_story_type: input.storyType,
    p_upload_mode: input.uploadMode,
    p_risk_level: input.riskLevel,
    p_logged_by_display_name: input.loggedByDisplayName ?? null,
    p_is_official: input.isOfficial,
    p_pin_is_official: input.pinIsOfficial,
    p_status: input.status,
    p_governance_flags: input.governanceFlags,
    p_media: input.media,
  })

  if (error) return { storyId: null, error: error.message }
  return { storyId: String(data), error: null }
}

export async function submitMemoryStory(
  client: SupabaseClient,
  input: SubmitStoryInput
): Promise<{ storyId: string | null; error: string | null }> {
  const idError = validateMemoryMapSubmitIds({
    source: input.dataSource ?? 'supabase',
    memoryMapId: input.memoryMapId,
    areaId: input.areaId,
    existingPinId: input.existingPinId,
    categoryId: input.pinCategoryId,
  })
  if (idError) return { storyId: null, error: idError }

  const { data, error } = await client.rpc('submit_memory_story', {
    p_memory_map_id: input.memoryMapId,
    p_area_id: input.areaId,
    p_existing_pin_id: input.existingPinId ?? null,
    p_pin_title: input.pinTitle ?? null,
    p_pin_description: input.pinDescription ?? null,
    p_pin_category_id: input.pinCategoryId ?? null,
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
    ...contributorGovernanceRpcParams({
      hasPermissionConfirmed: input.hasPermissionConfirmed,
      containsMinors: input.containsMinors,
      mentionsFullNames: input.mentionsFullNames,
      showsInjury: input.showsInjury,
      isArchiveContent: input.isArchiveContent,
      sponsorOrBrandVisible: input.sponsorOrBrandVisible,
    }),
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
  message: string,
  submissionPolicyAccepted: boolean
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('request_memory_map_contributor_access', {
    p_memory_map_id: memoryMapId,
    p_relationship: relationship || null,
    p_request_message: message || null,
    p_submission_policy_accepted: submissionPolicyAccepted,
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

export async function approveMemoryStory(
  client: SupabaseClient,
  storyId: string,
  approvalNote?: string
) {
  const { error } = await client.rpc('approve_memory_story', {
    p_story_id: storyId,
    p_approval_note: approvalNote ?? null,
  })
  return { error: normalizeApprovalError(error?.message) }
}

export type AdminUpdateStoryInput = {
  storyId: string
  title?: string
  description?: string | null
  eventYear?: number
  eventDate?: string | null
  loggedByDisplayName?: string | null
  riskLevel?: RiskLevel
  governanceFlags?: Record<string, unknown>
  tags?: string[]
}

export async function adminUpdateMemoryStory(
  client: SupabaseClient,
  input: AdminUpdateStoryInput
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('admin_update_memory_story', {
    p_story_id: input.storyId,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_event_year: input.eventYear ?? null,
    p_event_date: input.eventDate ?? null,
    p_logged_by_display_name: input.loggedByDisplayName ?? null,
    p_risk_level: input.riskLevel ?? null,
    p_governance_flags: input.governanceFlags ?? null,
    p_tags: input.tags ?? null,
  })
  return { error: error?.message ?? null }
}

export type AdminUpdatePinInput = {
  pinId: string
  title?: string
  description?: string | null
  categoryId?: string | null
  lat?: number | null
  lng?: number | null
  x?: number | null
  y?: number | null
}

export async function adminUpdateMemoryPin(
  client: SupabaseClient,
  input: AdminUpdatePinInput
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('admin_update_memory_pin', {
    p_pin_id: input.pinId,
    p_title: input.title ?? null,
    p_description: input.description ?? null,
    p_category_id: input.categoryId ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_x_position: input.x ?? null,
    p_y_position: input.y ?? null,
  })
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

export async function updateMemoryMapStartPoint(
  client: SupabaseClient,
  mapId: string,
  fields: { default_lat: number | null; default_lng: number | null; default_zoom: number }
) {
  const { error } = await client.rpc('update_memory_map_start_point', {
    p_map_id: mapId,
    p_default_lat: fields.default_lat,
    p_default_lng: fields.default_lng,
    p_default_zoom: fields.default_zoom,
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

export type CreateMemoryMapInput = {
  orgName: string
  orgType: string
  orgSlug: string
  orgDescription?: string
  orgLogoUrl?: string
  mapTitle: string
  mapSlug: string
  tagline?: string
  description?: string
  visibility: string
  status: string
  profileImageUrl?: string
  landingBackgroundUrl?: string
  primaryColor?: string
  accentColor?: string
  sponsorName?: string
  sponsorLogoUrl?: string
  sponsorWebsiteUrl?: string
  sponsorMessage?: string
}

export async function createMemoryMapPlatform(client: SupabaseClient, input: CreateMemoryMapInput) {
  const { data, error } = await client.rpc('create_memory_map_platform', {
    p_org_name: input.orgName,
    p_org_type: input.orgType,
    p_org_slug: input.orgSlug,
    p_org_description: input.orgDescription ?? null,
    p_org_logo_url: input.orgLogoUrl ?? null,
    p_map_title: input.mapTitle,
    p_map_slug: input.mapSlug,
    p_tagline: input.tagline ?? null,
    p_description: input.description ?? null,
    p_visibility: input.visibility,
    p_status: input.status,
    p_profile_image_url: input.profileImageUrl ?? null,
    p_landing_background_url: input.landingBackgroundUrl ?? null,
    p_primary_color: input.primaryColor ?? '#FFD400',
    p_accent_color: input.accentColor ?? '#FFD400',
    p_sponsor_name: input.sponsorName ?? null,
    p_sponsor_logo_url: input.sponsorLogoUrl ?? null,
    p_sponsor_website_url: input.sponsorWebsiteUrl ?? null,
    p_sponsor_message: input.sponsorMessage ?? null,
  })
  if (error) return { mapId: null, error: error.message }
  return { mapId: String(data), error: null }
}

export type UpsertAreaInput = {
  mapId: string
  areaId?: string | null
  name: string
  description?: string
  areaGroup?: string
  mapType: 'geo' | 'image'
  centreLat?: number | null
  centreLng?: number | null
  defaultZoom?: number | null
  defaultXPosition?: number | null
  defaultYPosition?: number | null
  defaultImageZoom?: number | null
  geofencePolygon?: unknown
  mapImageUrl?: string
  imageWidth?: number | null
  imageHeight?: number | null
  sortOrder?: number
  isActive?: boolean
}

export async function upsertMemoryArea(client: SupabaseClient, input: UpsertAreaInput) {
  const { data, error } = await client.rpc('upsert_memory_area', {
    p_map_id: input.mapId,
    p_area_id: input.areaId ?? null,
    p_name: input.name,
    p_description: input.description ?? null,
    p_area_group: input.areaGroup ?? null,
    p_map_type: input.mapType,
    p_centre_lat: input.centreLat ?? null,
    p_centre_lng: input.centreLng ?? null,
    p_geofence_polygon: input.geofencePolygon ?? null,
    p_map_image_url: input.mapImageUrl ?? null,
    p_image_width: input.imageWidth ?? null,
    p_image_height: input.imageHeight ?? null,
    p_sort_order: input.sortOrder ?? 0,
    p_is_active: input.isActive ?? true,
    p_default_zoom: input.defaultZoom ?? null,
    p_default_x_position: input.defaultXPosition ?? null,
    p_default_y_position: input.defaultYPosition ?? null,
    p_default_image_zoom: input.defaultImageZoom ?? null,
  })
  if (error) return { areaId: null, error: error.message }
  return { areaId: String(data), error: null }
}

export async function archiveMemoryArea(client: SupabaseClient, areaId: string) {
  const { error } = await client.rpc('archive_memory_area', { p_area_id: areaId })
  return { error: error?.message ?? null }
}

export async function manageMemoryMapMember(
  client: SupabaseClient,
  memberId: string,
  action: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'remove' | 'change_role',
  options?: { reason?: string; newRole?: string }
) {
  const { error } = await client.rpc('manage_memory_map_member', {
    p_member_id: memberId,
    p_action: action,
    p_reason: options?.reason ?? null,
    p_new_role: options?.newRole ?? null,
  })
  return { error: error?.message ?? null }
}

export async function createMemoryMapInvite(
  client: SupabaseClient,
  mapId: string,
  options?: { role?: string; autoApprove?: boolean; expiresAt?: string | null }
): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await client.rpc('create_memory_map_invite', {
    p_map_id: mapId,
    p_role: options?.role ?? 'contributor',
    p_auto_approve: options?.autoApprove ?? false,
    p_expires_at: options?.expiresAt ?? null,
  })
  if (error) return { token: null, error: error.message }
  return { token: data == null ? null : String(data), error: null }
}

export async function redeemMemoryMapInvite(
  client: SupabaseClient,
  inviteToken: string,
  relationship: string,
  message: string,
  submissionPolicyAccepted: boolean
): Promise<{ error: string | null; autoApproved?: boolean }> {
  const { data, error } = await client.rpc('redeem_memory_map_invite', {
    p_invite_token: inviteToken,
    p_relationship: relationship || null,
    p_request_message: message || null,
    p_submission_policy_accepted: submissionPolicyAccepted,
  })
  if (error) return { error: error.message }
  const row = data as { auto_approved?: boolean } | null
  return { error: null, autoApproved: Boolean(row?.auto_approved) }
}
