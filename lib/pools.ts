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
  visible_in_pools?: boolean
  group_type?: string | null
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

export type PoolGroupsPreview = {
  total_matches: number
  teams: string[]
  fixtures: Array<{
    match_id: string
    home_team: string
    away_team: string
    kickoff_time: string
    group_names: string[]
  }>
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
  const { data, error } = await client
    .from('fixture_groups')
    .select('id, name, slug, is_active, visible_in_pools, group_type')
    .eq('is_active', true)
    .eq('visible_in_pools', true)
    .order('name', { ascending: true })
  if (!error) {
    return { rows: (data as FixtureGroupRow[] | null) ?? [], error: null }
  }

  // Fallback for environments where `group_type` column isn't migrated yet.
  const rpcRes = await client.rpc('list_fixture_groups')
  if (rpcRes.error) {
    return { rows: [] as FixtureGroupRow[], error }
  }
  const rows = ((rpcRes.data as FixtureGroupRow[] | null) ?? []).map((r) => ({
    ...r,
    group_type: null,
  }))
  return { rows, error: null }
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

export async function previewPoolGroups(client: SupabaseClient, groupIds: string[]) {
  const uniqueIds = [...new Set(groupIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return {
      preview: { total_matches: 0, teams: [], fixtures: [] } as PoolGroupsPreview,
      error: null,
    }
  }

  const normalize = (row: Record<string, unknown> | null): PoolGroupsPreview => {
    if (!row) return { total_matches: 0, teams: [], fixtures: [] }
    const rawFixtures = row.fixtures
    let fixturesArr: Record<string, unknown>[] = []
    if (Array.isArray(rawFixtures)) {
      fixturesArr = rawFixtures as Record<string, unknown>[]
    } else if (typeof rawFixtures === 'string') {
      try {
        const parsed = JSON.parse(rawFixtures) as unknown
        if (Array.isArray(parsed)) fixturesArr = parsed as Record<string, unknown>[]
      } catch {
        fixturesArr = []
      }
    }
    return {
      total_matches: num(row.total_matches),
      teams: (row.teams as string[] | null) ?? [],
      fixtures: fixturesArr.map((f) => ({
        match_id: String(f.match_id ?? ''),
        home_team: String(f.home_team ?? ''),
        away_team: String(f.away_team ?? ''),
        kickoff_time: String(f.kickoff_time ?? ''),
        group_names: (f.group_names as string[] | null) ?? [],
      })),
    }
  }

  const rpcRes = await client.rpc('preview_pool_groups', {
    p_group_ids: uniqueIds,
  })

  if (!rpcRes.error) {
    const row = ((rpcRes.data as Record<string, unknown>[] | null) ?? [])[0] ?? null
    return { preview: normalize(row), error: null }
  }

  // Fallback path for environments where preview RPC is not yet migrated.
  const [linksRes, groupsRes, coreTeamsRes] = await Promise.all([
    client
      .from('game_match_groups')
      .select('group_id, fixture_groups(name), game_matches(id, home_team, away_team, kickoff_time, status)')
      .in('group_id', uniqueIds),
    client.from('fixture_groups').select('id, name').in('id', uniqueIds),
    client.from('fixture_group_teams').select('group_id, team_name').in('group_id', uniqueIds),
  ])

  if (linksRes.error) {
    return { preview: null as PoolGroupsPreview | null, error: linksRes.error }
  }

  const selectedGroupNameById = new Map<string, string>()
  for (const row of (groupsRes.data as { id: string; name: string }[] | null) ?? []) {
    selectedGroupNameById.set(row.id, row.name)
  }

  type MatchItem = { id: string; home_team: string; away_team: string; kickoff_time: string; status: string }
  const matchMap = new Map<string, MatchItem>()
  const groupNamesByMatch = new Map<string, Set<string>>()

  for (const row of
    ((linksRes.data as {
      group_id: string
      fixture_groups: { name?: string } | { name?: string }[] | null
      game_matches:
        | { id?: string; home_team?: string; away_team?: string; kickoff_time?: string; status?: string }
        | {
            id?: string
            home_team?: string
            away_team?: string
            kickoff_time?: string
            status?: string
          }[]
        | null
    }[] | null) ?? [])) {
    const gmRaw = Array.isArray(row.game_matches) ? row.game_matches[0] : row.game_matches
    if (!gmRaw?.id) continue
    if ((gmRaw.status ?? '') === 'cancelled') continue
    const matchId = String(gmRaw.id)
    matchMap.set(matchId, {
      id: matchId,
      home_team: String(gmRaw.home_team ?? ''),
      away_team: String(gmRaw.away_team ?? ''),
      kickoff_time: String(gmRaw.kickoff_time ?? ''),
      status: String(gmRaw.status ?? ''),
    })
    if (!groupNamesByMatch.has(matchId)) groupNamesByMatch.set(matchId, new Set<string>())
    const fgRaw = Array.isArray(row.fixture_groups) ? row.fixture_groups[0] : row.fixture_groups
    const groupName = fgRaw?.name ?? selectedGroupNameById.get(row.group_id) ?? ''
    if (groupName) groupNamesByMatch.get(matchId)?.add(groupName)
  }

  const matches = [...matchMap.values()]
  const matchedTeamsByGroup = new Map<string, Set<string>>()
  for (const row of
    ((linksRes.data as {
      group_id: string
      game_matches:
        | { id?: string; home_team?: string; away_team?: string; kickoff_time?: string; status?: string }
        | {
            id?: string
            home_team?: string
            away_team?: string
            kickoff_time?: string
            status?: string
          }[]
        | null
    }[] | null) ?? [])) {
    const gmRaw = Array.isArray(row.game_matches) ? row.game_matches[0] : row.game_matches
    if (!gmRaw?.id || (gmRaw.status ?? '') === 'cancelled') continue
    if (!matchedTeamsByGroup.has(row.group_id)) matchedTeamsByGroup.set(row.group_id, new Set<string>())
    if (gmRaw.home_team) matchedTeamsByGroup.get(row.group_id)?.add(String(gmRaw.home_team))
    if (gmRaw.away_team) matchedTeamsByGroup.get(row.group_id)?.add(String(gmRaw.away_team))
  }

  const coreTeamsByGroup = new Map<string, Set<string>>()
  if (!coreTeamsRes.error) {
    for (const row of ((coreTeamsRes.data as { group_id: string; team_name: string | null }[] | null) ?? [])) {
      const teamName = (row.team_name ?? '').trim()
      if (!teamName) continue
      if (!coreTeamsByGroup.has(row.group_id)) coreTeamsByGroup.set(row.group_id, new Set<string>())
      coreTeamsByGroup.get(row.group_id)?.add(teamName)
    }
  }

  const includedTeams = new Set<string>()
  for (const groupId of uniqueIds) {
    const coreTeams = coreTeamsByGroup.get(groupId)
    if (coreTeams && coreTeams.size > 0) {
      for (const team of coreTeams) includedTeams.add(team)
      continue
    }
    for (const team of matchedTeamsByGroup.get(groupId) ?? new Set<string>()) {
      includedTeams.add(team)
    }
  }
  const teams = [...includedTeams].sort((a, b) => a.localeCompare(b))
  const nowTs = Date.now()
  const fixtures = matches
    .filter((m) => {
      const t = new Date(m.kickoff_time).getTime()
      return Number.isFinite(t) && t >= nowTs
    })
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    .slice(0, 10)
    .map((m) => ({
      match_id: m.id,
      home_team: m.home_team,
      away_team: m.away_team,
      kickoff_time: m.kickoff_time,
      group_names: [...(groupNamesByMatch.get(m.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
    }))

  return {
    preview: {
      total_matches: matches.length,
      teams,
      fixtures,
    },
    error: null,
  }
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
