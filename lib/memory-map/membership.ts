import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { resolveMemoryMapPermissions, type MemoryMapPermissions } from '@/lib/memory-map/permissions'
import type { MemberRole, MemberStatus, MemoryMapMember } from '@/lib/memory-map/types'

export type ContributorAccess = {
  userId: string | null
  isLoggedIn: boolean
  isAppAdmin: boolean
  isOrgAdmin: boolean
  isMapAdmin: boolean
  isMapSettingsAdmin: boolean
  isContentModerator: boolean
  isContributor: boolean
  canSubmit: boolean
  hasSubmissionPolicy: boolean
  permissions: MemoryMapPermissions
  member: MemoryMapMember | null
}

async function fetchMapMeta(
  client: SupabaseClient,
  memoryMapId: string
): Promise<{ organisationId: string | null; createdBy: string | null }> {
  const { data } = await client
    .from('memory_maps')
    .select('organisation_id, created_by')
    .eq('id', memoryMapId)
    .maybeSingle()

  return {
    organisationId: data?.organisation_id == null ? null : String(data.organisation_id),
    createdBy: data?.created_by == null ? null : String(data.created_by),
  }
}

async function fetchIsOrgAdmin(
  client: SupabaseClient,
  organisationId: string | null,
  userId: string,
  isAppAdmin: boolean
): Promise<boolean> {
  if (isAppAdmin || !organisationId) return isAppAdmin

  const { data } = await client
    .from('organisation_members')
    .select('role, status')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .maybeSingle()

  return data?.status === 'approved' && data?.role === 'admin'
}

export async function fetchContributorAccess(
  client: SupabaseClient,
  memoryMapId: string
): Promise<ContributorAccess> {
  const { data: sessionData } = await client.auth.getSession()
  const userId = sessionData.session?.user?.id ?? null

  if (!userId) {
    const permissions = resolveMemoryMapPermissions({
      isAppAdmin: false,
      isOrgAdmin: false,
      mapMemberRole: null,
      mapMemberStatus: null,
      isMapCreator: false,
    })
    return {
      userId: null,
      isLoggedIn: false,
      isAppAdmin: false,
      isOrgAdmin: false,
      isMapAdmin: false,
      isMapSettingsAdmin: false,
      isContentModerator: false,
      isContributor: false,
      canSubmit: false,
      hasSubmissionPolicy: false,
      permissions,
      member: null,
    }
  }

  const [{ isAdmin: isAppAdmin }, mapMeta, { data: memberRow }] = await Promise.all([
    fetchUserIsAdmin(client, userId),
    fetchMapMeta(client, memoryMapId),
    client
      .from('memory_map_members')
      .select('*')
      .eq('memory_map_id', memoryMapId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const isOrgAdmin = await fetchIsOrgAdmin(client, mapMeta.organisationId, userId, isAppAdmin)

  const member = memberRow
    ? ({
        id: String(memberRow.id),
        memory_map_id: String(memberRow.memory_map_id),
        user_id: String(memberRow.user_id),
        role: memberRow.role as MemberRole,
        status: memberRow.status as MemberStatus,
        relationship: memberRow.relationship == null ? null : String(memberRow.relationship),
        request_message: memberRow.request_message == null ? null : String(memberRow.request_message),
        approved_at: memberRow.approved_at == null ? null : String(memberRow.approved_at),
        submission_policy_accepted_at:
          memberRow.submission_policy_accepted_at == null
            ? null
            : String(memberRow.submission_policy_accepted_at),
        submission_policy_version:
          memberRow.submission_policy_version == null ? null : String(memberRow.submission_policy_version),
      } satisfies MemoryMapMember)
    : null

  const permissions = resolveMemoryMapPermissions({
    isAppAdmin,
    isOrgAdmin,
    mapMemberRole: member?.role ?? null,
    mapMemberStatus: member?.status ?? null,
    isMapCreator: mapMeta.createdBy === userId,
  })

  const hasSubmissionPolicy = isAppAdmin || Boolean(memberRow?.submission_policy_accepted_at)
  const isContentModerator = member?.status === 'approved' && member.role === 'moderator'

  return {
    userId,
    isLoggedIn: true,
    isAppAdmin,
    isOrgAdmin,
    isMapAdmin: permissions.canAccessAdminDashboard,
    isMapSettingsAdmin: permissions.canManageMapSettings,
    isContentModerator,
    isContributor: permissions.canSubmitContent,
    canSubmit: permissions.canSubmitContent && hasSubmissionPolicy,
    hasSubmissionPolicy,
    permissions,
    member,
  }
}

export async function fetchAllMembers(
  client: SupabaseClient,
  memoryMapId: string
): Promise<MemoryMapMember[]> {
  const { data } = await client
    .from('memory_map_members')
    .select('*')
    .eq('memory_map_id', memoryMapId)
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    id: String(row.id),
    memory_map_id: String(row.memory_map_id),
    user_id: String(row.user_id),
    role: row.role as MemberRole,
    status: row.status as MemberStatus,
    relationship: row.relationship == null ? null : String(row.relationship),
    request_message: row.request_message == null ? null : String(row.request_message),
    approved_at: row.approved_at == null ? null : String(row.approved_at),
    created_at: row.created_at == null ? null : String(row.created_at),
    approved_by: row.approved_by == null ? null : String(row.approved_by),
  }))
}

export async function fetchPendingMembers(
  client: SupabaseClient,
  memoryMapId: string
): Promise<MemoryMapMember[]> {
  const { data } = await client
    .from('memory_map_members')
    .select('*')
    .eq('memory_map_id', memoryMapId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    id: String(row.id),
    memory_map_id: String(row.memory_map_id),
    user_id: String(row.user_id),
    role: row.role as MemberRole,
    status: row.status as MemberStatus,
    relationship: row.relationship == null ? null : String(row.relationship),
    request_message: row.request_message == null ? null : String(row.request_message),
    approved_at: row.approved_at == null ? null : String(row.approved_at),
  }))
}
