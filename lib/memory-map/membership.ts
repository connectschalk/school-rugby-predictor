import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import type { MemberRole, MemberStatus, MemoryMapMember } from '@/lib/memory-map/types'

export type ContributorAccess = {
  userId: string | null
  isLoggedIn: boolean
  isAppAdmin: boolean
  isMapAdmin: boolean
  isContributor: boolean
  canSubmit: boolean
  hasSubmissionPolicy: boolean
  member: MemoryMapMember | null
}

export async function fetchContributorAccess(
  client: SupabaseClient,
  memoryMapId: string
): Promise<ContributorAccess> {
  const { data: sessionData } = await client.auth.getSession()
  const userId = sessionData.session?.user?.id ?? null

  if (!userId) {
    return {
      userId: null,
      isLoggedIn: false,
      isAppAdmin: false,
      isMapAdmin: false,
      isContributor: false,
      canSubmit: false,
      hasSubmissionPolicy: false,
      member: null,
    }
  }

  const { isAdmin: isAppAdmin } = await fetchUserIsAdmin(client, userId)

  const { data: memberRow } = await client
    .from('memory_map_members')
    .select('*')
    .eq('memory_map_id', memoryMapId)
    .eq('user_id', userId)
    .maybeSingle()

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

  const hasSubmissionPolicy =
    isAppAdmin || Boolean(memberRow?.submission_policy_accepted_at)

  const isMapAdmin =
    isAppAdmin ||
    member?.status === 'approved' && (member.role === 'admin' || member.role === 'moderator')

  const isContributor =
    isMapAdmin ||
    (member?.status === 'approved' && member.role === 'contributor')

  return {
    userId,
    isLoggedIn: true,
    isAppAdmin,
    isMapAdmin: Boolean(isMapAdmin),
    isContributor: Boolean(isContributor),
    canSubmit: Boolean(isContributor),
    hasSubmissionPolicy,
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
