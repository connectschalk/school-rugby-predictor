import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicSiteUrl } from '@/lib/site-url'
import type { OrganisationType } from '@/lib/memory-map/types'

export const MEMORY_MAP_ORG_INVITE_PATH_PREFIX = '/memory-map/invite/' as const
export const MEMORY_MAP_ORG_DASHBOARD_PATH_PREFIX = '/memory-map/orgs/' as const

export type OrganisationAccessLevel = 'platform_admin' | 'organisation_admin'

export type OrganisationAccessResult = {
  organisation: OrganisationRow | null
  accessLevel: OrganisationAccessLevel | null
  error: string | null
  forbidden: boolean
  signedOut: boolean
}

export type OrganisationAdminInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type OrganisationRow = {
  id: string
  name: string
  slug: string
  type: OrganisationType
  logo_url: string | null
  description: string | null
  primary_color: string | null
  secondary_color: string | null
  created_at: string | null
}

export type OrganisationMemberRow = {
  id: string
  organisation_id: string
  user_id: string
  role: string
  status: string
  approved_at: string | null
  display_name: string | null
}

export type OrganisationAdminInviteRow = {
  id: string
  organisation_id: string
  email: string
  role: string
  token: string
  status: OrganisationAdminInviteStatus
  invited_display_name: string | null
  invite_message: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export type OrganisationInviteLookup = {
  inviteId: string
  organisationId: string
  organisationName: string
  organisationSlug: string
  organisationType: string
  email: string
  role: string
  status: OrganisationAdminInviteStatus
  invitedDisplayName: string | null
  expiresAt: string
  acceptedAt: string | null
}

export function buildOrganisationAdminInviteUrl(token: string): string {
  return `${getPublicSiteUrl()}${MEMORY_MAP_ORG_INVITE_PATH_PREFIX}${encodeURIComponent(token)}`
}

export function organisationAdminInvitePath(token: string): string {
  return `${MEMORY_MAP_ORG_INVITE_PATH_PREFIX}${encodeURIComponent(token)}`
}

export function organisationDashboardPath(slug: string): string {
  return `${MEMORY_MAP_ORG_DASHBOARD_PATH_PREFIX}${encodeURIComponent(slug)}`
}

export function resolveOrganisationAccessLevel(
  isPlatformAdmin: boolean,
  isOrganisationAdmin: boolean
): OrganisationAccessLevel | null {
  if (isPlatformAdmin) return 'platform_admin'
  if (isOrganisationAdmin) return 'organisation_admin'
  return null
}

export function shouldShowMemoryMapPlatformAdminLink(isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin
}

function mapOrganisationRow(data: Record<string, unknown>): OrganisationRow {
  return {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    type: data.type as OrganisationType,
    logo_url: data.logo_url == null ? null : String(data.logo_url),
    description: data.description == null ? null : String(data.description),
    primary_color: data.primary_color == null ? null : String(data.primary_color),
    secondary_color: data.secondary_color == null ? null : String(data.secondary_color),
    created_at: data.created_at == null ? null : String(data.created_at),
  }
}

function mapInviteLookup(row: Record<string, unknown> | null): OrganisationInviteLookup | null {
  if (!row) return null
  return {
    inviteId: String(row.invite_id),
    organisationId: String(row.organisation_id),
    organisationName: String(row.organisation_name),
    organisationSlug: String(row.organisation_slug),
    organisationType: String(row.organisation_type),
    email: String(row.email),
    role: String(row.role),
    status: row.status as OrganisationAdminInviteStatus,
    invitedDisplayName: row.invited_display_name == null ? null : String(row.invited_display_name),
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at == null ? null : String(row.accepted_at),
  }
}

export async function fetchOrganisations(
  client: SupabaseClient
): Promise<{ organisations: OrganisationRow[]; error: string | null }> {
  const { data, error } = await client
    .from('organisations')
    .select('id, name, slug, type, logo_url, description, primary_color, secondary_color, created_at')
    .order('name')

  if (error) return { organisations: [], error: error.message }
  return {
    organisations: (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      type: row.type as OrganisationType,
      logo_url: row.logo_url == null ? null : String(row.logo_url),
      description: row.description == null ? null : String(row.description),
      primary_color: row.primary_color == null ? null : String(row.primary_color),
      secondary_color: row.secondary_color == null ? null : String(row.secondary_color),
      created_at: row.created_at == null ? null : String(row.created_at),
    })),
    error: null,
  }
}

export async function fetchOrganisationById(
  client: SupabaseClient,
  organisationId: string
): Promise<{ organisation: OrganisationRow | null; error: string | null }> {
  const { data, error } = await client
    .from('organisations')
    .select('id, name, slug, type, logo_url, description, primary_color, secondary_color, created_at')
    .eq('id', organisationId)
    .maybeSingle()

  if (error) return { organisation: null, error: error.message }
  if (!data) return { organisation: null, error: null }
  return {
    organisation: mapOrganisationRow(data as Record<string, unknown>),
    error: null,
  }
}

export async function fetchOrganisationBySlug(
  client: SupabaseClient,
  slug: string
): Promise<{ organisation: OrganisationRow | null; error: string | null }> {
  const { data, error } = await client
    .from('organisations')
    .select('id, name, slug, type, logo_url, description, primary_color, secondary_color, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return { organisation: null, error: error.message }
  if (!data) return { organisation: null, error: null }
  return {
    organisation: mapOrganisationRow(data as Record<string, unknown>),
    error: null,
  }
}

export async function fetchOrganisationBySlugForCurrentUser(
  client: SupabaseClient,
  slug: string
): Promise<OrganisationAccessResult> {
  const { data: sessionData } = await client.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) {
    return { organisation: null, accessLevel: null, error: null, forbidden: false, signedOut: true }
  }

  const { organisation, error } = await fetchOrganisationBySlug(client, slug)
  if (error) {
    return { organisation: null, accessLevel: null, error, forbidden: false, signedOut: false }
  }
  if (!organisation) {
    return { organisation: null, accessLevel: null, error: null, forbidden: false, signedOut: false }
  }

  const { fetchMemoryMapPlatformAdmin } = await import('@/lib/admin-access')
  const { isAdmin: isPlatformAdmin } = await fetchMemoryMapPlatformAdmin(client, userId)
  if (isPlatformAdmin) {
    return {
      organisation,
      accessLevel: 'platform_admin',
      error: null,
      forbidden: false,
      signedOut: false,
    }
  }

  const allowed = await canManageOrganisation(client, userId, organisation.id)
  if (!allowed) {
    return { organisation: null, accessLevel: null, error: null, forbidden: true, signedOut: false }
  }

  return {
    organisation,
    accessLevel: 'organisation_admin',
    error: null,
    forbidden: false,
    signedOut: false,
  }
}

export type AdminOrganisationSummary = {
  id: string
  name: string
  slug: string
}

export async function fetchAdminOrganisationsForUser(
  client: SupabaseClient,
  userId: string
): Promise<{ organisations: AdminOrganisationSummary[]; error: string | null }> {
  const { data, error } = await client
    .from('organisation_members')
    .select('organisations(id, name, slug)')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .eq('role', 'admin')

  if (error) return { organisations: [], error: error.message }

  const organisations: AdminOrganisationSummary[] = []
  for (const row of data ?? []) {
    const org = row.organisations as unknown as { id: string; name: string; slug: string } | null
    if (!org?.id) continue
    organisations.push({
      id: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
    })
  }

  organisations.sort((a, b) => a.name.localeCompare(b.name))
  return { organisations, error: null }
}

export async function fetchOrganisationMaps(
  client: SupabaseClient,
  organisationId: string
): Promise<{ maps: { id: string; title: string; slug: string; status: string }[]; error: string | null }> {
  const { data, error } = await client
    .from('memory_maps')
    .select('id, title, slug, status')
    .eq('organisation_id', organisationId)
    .order('title')

  if (error) return { maps: [], error: error.message }
  return {
    maps: (data ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      slug: String(row.slug),
      status: String(row.status),
    })),
    error: null,
  }
}

export async function fetchOrganisationMembers(
  client: SupabaseClient,
  organisationId: string
): Promise<{ members: OrganisationMemberRow[]; error: string | null }> {
  const { data, error } = await client
    .from('organisation_members')
    .select('id, organisation_id, user_id, role, status, approved_at')
    .eq('organisation_id', organisationId)
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })

  if (error) return { members: [], error: error.message }

  const members = data ?? []
  const userIds = members.map((m) => String(m.user_id))
  const profileByUser = new Map<string, string>()

  if (userIds.length > 0) {
    const { data: profiles } = await client
      .from('memory_map_profiles')
      .select('user_id, display_name, contributor_name')
      .in('user_id', userIds)

    for (const p of profiles ?? []) {
      const name = String(p.contributor_name ?? p.display_name ?? '').trim()
      if (name) profileByUser.set(String(p.user_id), name)
    }
  }

  return {
    members: members.map((row) => ({
      id: String(row.id),
      organisation_id: String(row.organisation_id),
      user_id: String(row.user_id),
      role: String(row.role),
      status: String(row.status),
      approved_at: row.approved_at == null ? null : String(row.approved_at),
      display_name: profileByUser.get(String(row.user_id)) ?? null,
    })),
    error: null,
  }
}

export async function fetchOrganisationInvites(
  client: SupabaseClient,
  organisationId: string
): Promise<{ invites: OrganisationAdminInviteRow[]; error: string | null }> {
  const { data, error } = await client
    .from('memory_map_admin_invites')
    .select(
      'id, organisation_id, email, role, token, status, invited_display_name, invite_message, expires_at, accepted_at, created_at'
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })

  if (error) return { invites: [], error: error.message }
  return {
    invites: (data ?? []).map((row) => ({
      id: String(row.id),
      organisation_id: String(row.organisation_id),
      email: String(row.email),
      role: String(row.role),
      token: String(row.token),
      status: row.status as OrganisationAdminInviteStatus,
      invited_display_name: row.invited_display_name == null ? null : String(row.invited_display_name),
      invite_message: row.invite_message == null ? null : String(row.invite_message),
      expires_at: String(row.expires_at),
      accepted_at: row.accepted_at == null ? null : String(row.accepted_at),
      created_at: String(row.created_at),
    })),
    error: null,
  }
}

export async function lookupOrganisationAdminInvite(
  client: SupabaseClient,
  token: string
): Promise<{ invite: OrganisationInviteLookup | null; error: string | null }> {
  const { data, error } = await client.rpc('lookup_organisation_admin_invite', { p_token: token })
  if (error) return { invite: null, error: error.message }
  return { invite: mapInviteLookup(data as Record<string, unknown> | null), error: null }
}

export type CreateOrganisationInput = {
  name: string
  type: OrganisationType
  slug: string
  description?: string
  logoUrl?: string
  primaryColor?: string
  secondaryColor?: string
}

export async function createMemoryMapOrganisation(
  client: SupabaseClient,
  input: CreateOrganisationInput
): Promise<{ organisationId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('create_memory_map_organisation', {
    p_name: input.name,
    p_type: input.type,
    p_slug: input.slug,
    p_description: input.description ?? null,
    p_logo_url: input.logoUrl ?? null,
    p_primary_color: input.primaryColor ?? '#FFD400',
    p_secondary_color: input.secondaryColor ?? '#005DAA',
  })
  if (error) return { organisationId: null, error: error.message }
  return { organisationId: data == null ? null : String(data), error: null }
}

/** Creates invite row + token via RPC. Does not send email — use `buildOrganisationAdminInviteUrl(token)` to share the link. */
export async function inviteOrganisationAdmin(
  client: SupabaseClient,
  organisationId: string,
  input: { email: string; role?: string; invitedDisplayName?: string; inviteMessage?: string }
): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await client.rpc('create_organisation_admin_invite', {
    p_organisation_id: organisationId,
    p_email: input.email.trim(),
    p_role: input.role ?? 'admin',
    p_invited_display_name: input.invitedDisplayName ?? null,
    p_invite_message: input.inviteMessage ?? null,
  })
  if (error) return { token: null, error: error.message }
  return { token: data == null ? null : String(data), error: null }
}

export async function revokeOrganisationInvite(
  client: SupabaseClient,
  inviteId: string
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('revoke_organisation_admin_invite', { p_invite_id: inviteId })
  return { error: error?.message ?? null }
}

export async function acceptOrganisationAdminInvite(
  client: SupabaseClient,
  token: string
): Promise<{
  organisationId: string | null
  organisationSlug: string | null
  error: string | null
}> {
  const { data, error } = await client.rpc('accept_organisation_admin_invite', { p_token: token })
  if (error) return { organisationId: null, organisationSlug: null, error: error.message }
  const row = data as Record<string, unknown> | null
  return {
    organisationId: row?.organisation_id == null ? null : String(row.organisation_id),
    organisationSlug: row?.organisation_slug == null ? null : String(row.organisation_slug),
    error: null,
  }
}

export async function removeOrganisationAdmin(
  client: SupabaseClient,
  organisationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await client.rpc('remove_organisation_admin', {
    p_organisation_id: organisationId,
    p_user_id: userId,
  })
  return { error: error?.message ?? null }
}

export async function canManageOrganisation(
  client: SupabaseClient,
  userId: string,
  organisationId: string
): Promise<boolean> {
  const { fetchMemoryMapPlatformAdmin } = await import('@/lib/admin-access')
  const { isAdmin } = await fetchMemoryMapPlatformAdmin(client, userId)
  if (isAdmin) return true

  const { data } = await client
    .from('organisation_members')
    .select('role, status')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .maybeSingle()

  return data?.status === 'approved' && data?.role === 'admin'
}

export type CreateOrganisationMapInput = {
  mapTitle: string
  mapSlug: string
  tagline?: string
  description?: string
  visibility?: string
  status?: string
  primaryColor?: string
  accentColor?: string
}

export async function createMemoryMapForOrganisation(
  client: SupabaseClient,
  organisationId: string,
  input: CreateOrganisationMapInput
): Promise<{ mapId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('create_memory_map_for_organisation', {
    p_organisation_id: organisationId,
    p_map_title: input.mapTitle,
    p_map_slug: input.mapSlug,
    p_tagline: input.tagline ?? null,
    p_description: input.description ?? null,
    p_visibility: input.visibility ?? 'link_only',
    p_status: input.status ?? 'draft',
    p_primary_color: input.primaryColor ?? '#FFD400',
    p_accent_color: input.accentColor ?? '#FFD400',
  })
  if (error) return { mapId: null, error: error.message }
  return { mapId: data == null ? null : String(data), error: null }
}
