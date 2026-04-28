'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

export type PoolRow = {
  id: string
  name: string
  admin_user_id: string
  created_by: string
  is_public: boolean
  invite_token: string
  is_closed: boolean
  created_at: string
  updated_at: string
}

export type FixtureGroupRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export type PoolMemberRow = {
  pool_id: string
  user_id: string
  joined_at: string
}

export type PoolJoinRequestRow = {
  id: string
  user_id: string
  display_name: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
}

export type PoolLeaderboardRow = {
  user_id: string
  display_name: string
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
  joined_at: string
  total_points: number
  total_margin_difference: number
  average_margin_difference: number | null
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** Row shape returned by `public.my_pools` RPC. */
type MyPoolsRpcRow = PoolRow & { joined_at: string }

/** Current user's pools via `public.my_pools` (security definer; uses auth.uid()). */
export async function fetchMyPools(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc('my_pools')

  if (error) {
    return { pools: [] as PoolRow[], memberships: [] as PoolMemberRow[], error }
  }

  const rows = (data as MyPoolsRpcRow[] | null) ?? []

  const pools: PoolRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    admin_user_id: row.admin_user_id,
    created_by: row.created_by,
    is_public: row.is_public,
    invite_token: row.invite_token,
    is_closed: row.is_closed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))

  const memberships: PoolMemberRow[] = rows.map((row) => ({
    pool_id: row.id,
    user_id: userId,
    joined_at: row.joined_at,
  }))

  return { pools, memberships, error: null }
}

/** Minimal pool info for invite link landing (RPC; no emails). */
export type PoolInvitePreview = {
  id: string
  name: string
  is_public: boolean
}

export async function fetchPoolByInviteToken(client: SupabaseClient, token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    return { pool: null as PoolInvitePreview | null, error: null }
  }

  const { data, error } = await client.rpc('get_pool_by_invite_token', {
    p_invite_token: trimmed,
  })

  if (error) return { pool: null as PoolInvitePreview | null, error }

  const rows = (data as PoolInvitePreview[] | null) ?? []
  const pool = rows[0] ?? null
  return { pool, error: null }
}

export async function searchPublicPools(client: SupabaseClient, query: string) {
  const { data, error } = await client.rpc('search_public_pools', {
    p_query: query.trim() || null,
    p_limit: 30,
  })
  return { rows: (data as Record<string, unknown>[] | null) ?? [], error }
}

export async function requestJoinPool(client: SupabaseClient, poolId: string, inviteToken?: string) {
  // Must match public.request_pool_join(p_pool_id uuid, p_invite_token text). Build keys in that order
  // (avoid shorthand / alphabetical object keys that produce p_invite_token first in JSON).
  const params: Record<string, string | null> = {}
  params.p_pool_id = poolId
  params.p_invite_token = inviteToken ?? null
  const { data, error } = await client.rpc('request_pool_join', params)
  return { row: (data as PoolJoinRequestRow | null) ?? null, error }
}

export async function fetchPoolJoinRequests(client: SupabaseClient, poolId: string) {
  const { data, error } = await client.rpc('pending_pool_join_requests', {
    p_pool_id: poolId,
  })

  return { rows: (data as PoolJoinRequestRow[] | null) ?? [], error }
}

export async function reviewPoolJoinRequest(
  client: SupabaseClient,
  requestId: string,
  action: 'approve' | 'reject'
) {
  const { data, error } = await client.rpc('review_pool_join_request', {
    p_request_id: requestId,
    p_action: action,
  })
  return { row: (data as PoolJoinRequestRow | null) ?? null, error }
}

export async function removePoolMember(client: SupabaseClient, poolId: string, userId: string) {
  const { error } = await client.rpc('remove_pool_member', {
    p_pool_id: poolId,
    p_user_id: userId,
  })
  return { error }
}

export async function leavePool(client: SupabaseClient, poolId: string, newAdminUserId?: string) {
  const { error } = await client.rpc('leave_pool', {
    p_pool_id: poolId,
    p_new_admin_user_id: newAdminUserId ?? null,
  })
  return { error }
}

export async function deletePool(client: SupabaseClient, poolId: string) {
  const { error } = await client.rpc('delete_pool', {
    p_pool_id: poolId,
  })
  return { error }
}

export async function fetchFixtureGroups(client: SupabaseClient) {
  const { data, error } = await client.rpc('list_fixture_groups')
  return { rows: (data as FixtureGroupRow[] | null) ?? [], error }
}

export async function fetchPoolGroups(client: SupabaseClient, poolId: string) {
  const { data, error } = await client
    .from('pool_groups')
    .select('group_id, fixture_groups(id, name, slug, is_active)')
    .eq('pool_id', poolId)

  if (error) return { rows: [] as FixtureGroupRow[], error }
  const rows = ((data as { fixture_groups: FixtureGroupRow | FixtureGroupRow[] | null }[] | null) ?? [])
    .map((r) => (Array.isArray(r.fixture_groups) ? r.fixture_groups[0] : r.fixture_groups))
    .filter((r): r is FixtureGroupRow => Boolean(r))
  return { rows, error: null }
}

export async function setPoolGroups(client: SupabaseClient, poolId: string, groupIds: string[]) {
  const { data, error } = await client.rpc('set_pool_groups', {
    p_pool_id: poolId,
    p_group_ids: groupIds,
  })
  return { count: num(data), error }
}

export async function fetchPoolLeaderboard(client: SupabaseClient, poolId: string) {
  const { data, error } = await client.rpc('pool_leaderboard', {
    p_pool_id: poolId,
    p_week_start: null,
  })
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    user_id: String(r.user_id ?? ''),
    display_name: String(r.display_name ?? 'Player'),
    avatar_url: r.avatar_url == null ? null : String(r.avatar_url),
    avatar_letter: r.avatar_letter == null ? null : String(r.avatar_letter),
    avatar_colour: r.avatar_colour == null ? null : String(r.avatar_colour),
    joined_at: String(r.joined_at ?? ''),
    total_points: num(r.total_points),
    total_margin_difference: num(r.total_margin_difference),
    average_margin_difference:
      r.average_margin_difference == null ? null : num(r.average_margin_difference),
  }))
  return { rows, error }
}

export async function fetchEffectivePoolMatches(client: SupabaseClient, poolId: string) {
  const { data, error } = await client.rpc('pool_effective_matches', {
    p_pool_id: poolId,
    p_week_start: null,
  })
  const ids = (((data as Record<string, unknown>[] | null) ?? [])
    .map((r) => String(r.match_id ?? ''))
    .filter(Boolean))
  return { matchIds: ids, error }
}

export async function upsertPoolMatches(client: SupabaseClient, poolId: string, matchIds: string[]) {
  const { data, error } = await client.rpc('upsert_pool_matches', {
    p_pool_id: poolId,
    p_match_ids: matchIds,
    p_week_start: null,
  })
  return { inserted: num(data), error }
}
