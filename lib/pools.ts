'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getCompetitionBySlug, SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { isUuid } from '@/lib/pool-invite-path'
import {
  isPoolJoinCodeTakenError,
  normalizePoolJoinCodeInput,
  POOL_JOIN_CODE_TAKEN_MESSAGE,
  validatePoolJoinCodeInput,
} from '@/lib/pool-join-code'
import type { GameMatch } from '@/lib/public-prediction-game'

export type GameMatchForPoolPicks = GameMatch & { prediction_cutoff_time?: string | null }

export type PoolRow = {
  id: string
  name: string
  admin_user_id: string
  created_by: string
  is_public: boolean
  invite_token: string
  join_code: string
  is_closed: boolean
  competition_id?: string | null
  logo_url?: string | null
  logo_path?: string | null
  logo_updated_at?: string | null
  created_at: string
  updated_at: string
}

export const MAX_POOLS_PER_COMPETITION = 3

export const POOL_CREATION_LIMIT_MESSAGE = 'You can create up to 3 pools per competition.'

/** Legacy pools with null competition_id count toward NextPlay Schools only. */
export function poolMatchesCompetition(
  pool: Pick<PoolRow, 'competition_id'>,
  competitionId: string,
  schoolsCompetitionId?: string | null
): boolean {
  const poolCompetitionId = pool.competition_id
  if (poolCompetitionId) return poolCompetitionId === competitionId
  return schoolsCompetitionId != null && competitionId === schoolsCompetitionId
}

export function countUserAdminPoolsForCompetition(
  pools: PoolRow[],
  userId: string,
  competitionId: string,
  schoolsCompetitionId?: string | null
): number {
  return pools.filter(
    (p) =>
      p.admin_user_id === userId &&
      poolMatchesCompetition(p, competitionId, schoolsCompetitionId)
  ).length
}

export function canUserCreatePoolInCompetition(
  pools: PoolRow[],
  userId: string,
  competitionId: string,
  options?: { isAppAdmin?: boolean; schoolsCompetitionId?: string | null }
): boolean {
  if (options?.isAppAdmin) return true
  return (
    countUserAdminPoolsForCompetition(
      pools,
      userId,
      competitionId,
      options?.schoolsCompetitionId
    ) < MAX_POOLS_PER_COMPETITION
  )
}

export async function createPool(
  client: SupabaseClient,
  params: {
    name: string
    isPublic: boolean
    competitionId?: string | null
    joinCode?: string | null
  }
): Promise<{ pool: PoolRow | null; error: Error | null }> {
  let competitionId = params.competitionId ?? null
  if (!competitionId) {
    const { competition } = await getCompetitionBySlug(client, SCHOOLS_COMPETITION_SLUG)
    competitionId = competition?.id ?? null
  }

  const joinCodeRaw = params.joinCode?.trim() ?? ''
  const rpcParams: Record<string, string | boolean | null> = {
    p_name: params.name.trim(),
    p_is_public: params.isPublic,
    p_competition_id: competitionId,
    p_join_code: joinCodeRaw ? normalizePoolJoinCodeInput(joinCodeRaw) : null,
  }

  const { data, error } = await client.rpc('create_pool', rpcParams)

  if (error) {
    const msg = error.message ?? 'Could not create pool.'
    if (isPoolJoinCodeTakenError(msg)) {
      return { pool: null, error: new Error(POOL_JOIN_CODE_TAKEN_MESSAGE) }
    }
    return { pool: null, error: new Error(msg) }
  }
  if (!data) return { pool: null, error: new Error('Could not create pool.') }

  const pool = normalizePoolRow(data as Record<string, unknown>)
  if (pool.invite_token && pool.join_code) return { pool, error: null }

  const { pools, error: reloadErr } = await fetchMyPools(client, pool.admin_user_id)
  if (reloadErr) return { pool: null, error: new Error(reloadErr.message) }
  const refreshed = pools.find((p) => p.id === pool.id)
  if (!refreshed?.invite_token || !refreshed.join_code) {
    return { pool: null, error: new Error('Pool created but invite details are missing.') }
  }
  return { pool: refreshed, error: null }
}

function normalizePoolRow(data: Record<string, unknown>): PoolRow {
  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    admin_user_id: String(data.admin_user_id ?? ''),
    created_by: String(data.created_by ?? ''),
    is_public: Boolean(data.is_public),
    invite_token: String(data.invite_token ?? '').trim(),
    join_code: String(data.join_code ?? '').trim().toLowerCase(),
    is_closed: Boolean(data.is_closed),
    competition_id: data.competition_id != null ? String(data.competition_id) : null,
    logo_url: data.logo_url == null ? null : String(data.logo_url),
    logo_path: data.logo_path == null ? null : String(data.logo_path),
    logo_updated_at: data.logo_updated_at == null ? null : String(data.logo_updated_at),
    created_at: String(data.created_at ?? ''),
    updated_at: String(data.updated_at ?? ''),
  }
}

export type PoolSearchRow = {
  id: string
  name: string
  join_code: string
  admin_user_id: string
  admin_display_name: string | null
  competition_id: string | null
  competition_slug: string
  competition_name: string
  is_public: boolean
  member_count: number
  match_kind: 'join_code' | 'invite_token' | 'name' | string
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

export type PoolTeamRow = {
  id: string
  pool_id: string
  team_name: string
  created_at: string
}

export type PoolJoinRequestRow = {
  id: string
  user_id: string
  display_name: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
}

export type PendingJoinRequestRef = {
  pool_id: string
  requested_at: string
}

export const POOL_JOIN_REQUEST_ALREADY_SENT = 'request already sent'

export function isPoolJoinRequestAlreadySentError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return msg.includes('request already sent')
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
  games_predicted: number
  correct_winners: number
  margin_points_total: number
}

export type PoolMatchPredictionViewerRpcRow = {
  user_id: string
  display_name: string
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
  is_viewer: boolean
  reveal_allowed: boolean
  predicted_winner: string | null
  predicted_margin: number | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  is_locked: boolean | null
  locked_at: string | null
  submitted_at: string | null
  score_total_points: number | null
  score_margin_difference: number | null
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

const PREVIEW_TEAM_ALIAS_MAP: Record<string, string> = {
  'paarl boys': 'paarl boys high',
  'paarl boys high': 'paarl boys high',
  'paarl gim': 'paarl gimnasium',
  'paarl gimnasium': 'paarl gimnasium',
  affies: 'afrikaans hoer seuns',
  'afrikaans hoer seuns': 'afrikaans hoer seuns',
}

function normalizePreviewTeamName(name: string): string {
  const n = name.trim().toLowerCase()
  return PREVIEW_TEAM_ALIAS_MAP[n] ?? n
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
export async function fetchMyPools(
  client: SupabaseClient,
  userId: string,
  competitionId?: string
) {
  const { data, error } = await client.rpc('my_pools')

  if (error) {
    return { pools: [] as PoolRow[], memberships: [] as PoolMemberRow[], error }
  }

  const rows = (data as MyPoolsRpcRow[] | null) ?? []

  let pools: PoolRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    admin_user_id: row.admin_user_id,
    created_by: row.created_by,
    is_public: row.is_public,
    invite_token: row.invite_token,
    join_code: String(row.join_code ?? '').trim().toLowerCase(),
    is_closed: row.is_closed,
    competition_id: row.competition_id != null ? String(row.competition_id) : null,
    logo_url: row.logo_url == null ? null : String(row.logo_url),
    logo_path: row.logo_path == null ? null : String(row.logo_path),
    logo_updated_at: row.logo_updated_at == null ? null : String(row.logo_updated_at),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))

  if (competitionId) {
    const { competition: schoolsCompetition } = await getCompetitionBySlug(
      client,
      SCHOOLS_COMPETITION_SLUG
    )
    const schoolsCompetitionId = schoolsCompetition?.id ?? null
    pools = pools.filter((p) => poolMatchesCompetition(p, competitionId, schoolsCompetitionId))
  }

  const poolIds = new Set(pools.map((p) => p.id))
  const memberships: PoolMemberRow[] = rows
    .filter((row) => poolIds.has(row.id))
    .map((row) => ({
      pool_id: row.id,
      user_id: userId,
      joined_at: row.joined_at,
    }))

  return { pools, memberships, error: null }
}

/** Invite-safe pool preview (RPC; no private pool data beyond name + inviter display). */
export type PoolInvitePreview = {
  id: string
  name: string
  is_public: boolean
  is_closed: boolean
  competition_id: string | null
  competition_slug: string
  competition_name: string
  competition_logo_url: string | null
  logo_url: string | null
  invite_token: string
  /** sharer = valid ?from= uuid; admin = pool admin profile; anonymous = no display names */
  inviter_kind: 'sharer' | 'admin' | 'anonymous'
  inviter_display_name: string | null
  inviter_avatar_url: string | null
  inviter_avatar_letter: string | null
  inviter_avatar_colour: string | null
}

export type PoolInviteViewerState = {
  pool_id: string
  is_member: boolean
  has_pending_request: boolean
}

export function parsePoolInviteRow(raw: Record<string, unknown>): PoolInvitePreview {
  const kindRaw = String(raw.inviter_kind ?? 'anonymous')
  const inviter_kind = kindRaw === 'sharer' || kindRaw === 'admin' ? kindRaw : 'anonymous'
  return {
    id: String(raw.pool_id ?? raw.id ?? ''),
    name: String(raw.pool_name ?? raw.name ?? ''),
    is_public: Boolean(raw.is_public),
    is_closed: Boolean(raw.is_closed),
    competition_id: raw.competition_id != null ? String(raw.competition_id) : null,
    competition_slug: String(raw.competition_slug ?? SCHOOLS_COMPETITION_SLUG),
    competition_name: String(raw.competition_name ?? 'NextPlay Schools'),
    competition_logo_url:
      raw.competition_logo_url == null ? null : String(raw.competition_logo_url),
    logo_url:
      raw.pool_logo_url != null
        ? String(raw.pool_logo_url)
        : raw.logo_url == null
          ? null
          : String(raw.logo_url),
    invite_token: String(raw.invite_token ?? ''),
    inviter_kind,
    inviter_display_name: raw.inviter_display_name == null ? null : String(raw.inviter_display_name),
    inviter_avatar_url: raw.inviter_avatar_url == null ? null : String(raw.inviter_avatar_url),
    inviter_avatar_letter:
      raw.inviter_avatar_letter == null ? null : String(raw.inviter_avatar_letter),
    inviter_avatar_colour:
      raw.inviter_avatar_colour == null ? null : String(raw.inviter_avatar_colour),
  }
}

export async function fetchPoolInviteByToken(
  client: SupabaseClient,
  token: string,
  invitedByUserId?: string | null
) {
  const trimmed = token.trim()
  if (!trimmed) {
    return { pool: null as PoolInvitePreview | null, error: null }
  }

  const invited = invitedByUserId && isUuid(invitedByUserId) ? invitedByUserId.trim() : null

  const { data, error } = await client.rpc('get_pool_invite_by_token', {
    p_token: trimmed,
    p_invited_by: invited,
  })

  if (error) return { pool: null as PoolInvitePreview | null, error }

  const rows = (data as Record<string, unknown>[] | null) ?? []
  const raw = rows[0]
  if (!raw) return { pool: null, error: null }
  return { pool: parsePoolInviteRow(raw), error: null }
}

export async function fetchPoolByInviteToken(
  client: SupabaseClient,
  token: string,
  invitedByUserId?: string | null
) {
  const { pool, error } = await fetchPoolInviteByToken(client, token, invitedByUserId)
  if (error) return { pool: null as PoolInvitePreview | null, error }
  if (!pool || pool.is_closed) return { pool: null, error: null }
  return { pool, error: null }
}

export async function fetchPoolInviteViewerState(client: SupabaseClient, token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    return { state: null as PoolInviteViewerState | null, error: null }
  }
  const { data, error } = await client.rpc('pool_invite_viewer_state', {
    p_invite_token: trimmed,
  })
  if (error) return { state: null as PoolInviteViewerState | null, error }
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const raw = rows[0]
  if (!raw) return { state: null, error: null }
  return {
    state: {
      pool_id: String(raw.pool_id ?? ''),
      is_member: Boolean(raw.is_member),
      has_pending_request: Boolean(raw.has_pending_request),
    },
    error: null,
  }
}

export async function searchPublicPools(
  client: SupabaseClient,
  query: string,
  competitionId?: string
) {
  const params: Record<string, string | number | null> = {
    p_query: query.trim() || null,
    p_limit: 30,
  }
  if (competitionId) {
    params.p_competition_id = competitionId
  }
  const { data, error } = await client.rpc('search_public_pools', params)
  const rows: PoolSearchRow[] = ((data as Record<string, unknown>[] | null) ?? []).map((raw) => ({
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    join_code: String(raw.join_code ?? '').toLowerCase(),
    admin_user_id: String(raw.admin_user_id ?? ''),
    admin_display_name:
      raw.admin_display_name == null ? null : String(raw.admin_display_name),
    competition_id: raw.competition_id != null ? String(raw.competition_id) : null,
    competition_slug: String(raw.competition_slug ?? SCHOOLS_COMPETITION_SLUG),
    competition_name: String(raw.competition_name ?? 'NextPlay Schools'),
    is_public: Boolean(raw.is_public),
    member_count: Number(raw.member_count ?? 0),
    match_kind: String(raw.match_kind ?? 'name'),
  }))
  return { rows, error }
}

/** Exact join-code lookup (no competition filter — used on competition home join flow). */
export async function findPoolByJoinCode(
  client: SupabaseClient,
  joinCodeRaw: string
): Promise<{
  row: PoolSearchRow | null
  error: string | null
  validationError: boolean
}> {
  const validation = validatePoolJoinCodeInput(joinCodeRaw)
  if (validation) {
    return { row: null, error: validation, validationError: true }
  }

  const normalized = normalizePoolJoinCodeInput(joinCodeRaw)
  const { rows, error } = await searchPublicPools(client, normalized)
  if (error) {
    return { row: null, error: error.message, validationError: false }
  }

  const row =
    rows.find((r) => r.match_kind === 'join_code' && r.join_code === normalized) ??
    rows.find((r) => r.match_kind === 'join_code') ??
    null

  return { row, error: null, validationError: false }
}

export async function requestJoinPool(
  client: SupabaseClient,
  poolId: string,
  options?: { inviteToken?: string; joinCode?: string }
) {
  const params: Record<string, string | null> = {}
  params.p_pool_id = poolId
  params.p_invite_token = options?.inviteToken ?? null
  params.p_join_code = options?.joinCode
    ? normalizePoolJoinCodeInput(options.joinCode)
    : null
  const { data, error } = await client.rpc('request_pool_join', params)
  if (error && isPoolJoinRequestAlreadySentError(error)) {
    return {
      row: null,
      error: new Error(POOL_JOIN_REQUEST_ALREADY_SENT),
      alreadySent: true as const,
    }
  }
  return {
    row: (data as PoolJoinRequestRow | null) ?? null,
    error,
    alreadySent: false as const,
  }
}

export async function fetchPoolJoinRequests(client: SupabaseClient, poolId: string) {
  const { data, error } = await client.rpc('get_pool_join_requests', {
    p_pool_id: poolId,
  })

  return { rows: (data as PoolJoinRequestRow[] | null) ?? [], error }
}

export async function fetchMyPendingPoolJoinRequests(
  client: SupabaseClient,
  competitionId?: string
) {
  const { data, error } = await client.rpc('my_pending_pool_join_requests', {
    p_competition_id: competitionId ?? null,
  })
  return {
    rows: (data as PendingJoinRequestRef[] | null) ?? [],
    error,
  }
}

export async function fetchAdminPoolPendingJoinCounts(
  client: SupabaseClient,
  competitionId?: string
) {
  const { data, error } = await client.rpc('my_admin_pool_pending_join_counts', {
    p_competition_id: competitionId ?? null,
  })
  const map = new Map<string, number>()
  for (const row of (data as { pool_id: string; pending_count: number }[] | null) ?? []) {
    map.set(String(row.pool_id), Number(row.pending_count ?? 0))
  }
  return { counts: map, error }
}

export async function approvePoolJoinRequest(client: SupabaseClient, requestId: string) {
  const { data, error } = await client.rpc('approve_pool_join_request', {
    p_request_id: requestId,
  })
  return { row: (data as PoolJoinRequestRow | null) ?? null, error }
}

export async function declinePoolJoinRequest(client: SupabaseClient, requestId: string) {
  const { data, error } = await client.rpc('decline_pool_join_request', {
    p_request_id: requestId,
  })
  return { row: (data as PoolJoinRequestRow | null) ?? null, error }
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

export async function fetchPoolTeams(client: SupabaseClient, poolId: string) {
  const { data, error } = await client
    .from('pool_teams')
    .select('id, pool_id, team_name, created_at')
    .eq('pool_id', poolId)
    .order('team_name', { ascending: true })
  return { rows: (data as PoolTeamRow[] | null) ?? [], error }
}

/** Replaces all pool_teams for the pool (admin only via RLS). Pass [] to clear. */
export async function replacePoolTeams(client: SupabaseClient, poolId: string, teamNames: string[]) {
  const unique = [...new Set(teamNames.map((t) => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const { error: delErr } = await client.from('pool_teams').delete().eq('pool_id', poolId)
  if (delErr) return { error: delErr }
  if (unique.length === 0) return { error: null }
  const { error: insErr } = await client.from('pool_teams').insert(unique.map((team_name) => ({ pool_id: poolId, team_name })))
  return { error: insErr }
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

export async function previewPoolGroups(
  client: SupabaseClient,
  groupIds: string[],
  competitionId?: string
) {
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

  const rpcParams: Record<string, string[] | string | null> = {
    p_group_ids: uniqueIds,
  }
  if (competitionId) {
    rpcParams.p_competition_id = competitionId
  }

  const rpcRes = await client.rpc('preview_pool_groups', rpcParams)

  if (!rpcRes.error) {
    const row = ((rpcRes.data as Record<string, unknown>[] | null) ?? [])[0] ?? null
    return { preview: normalize(row), error: null }
  }

  // Fallback path for environments where preview RPC is not yet migrated.
  const [linksRes, groupsRes, coreTeamsRes] = await Promise.all([
    client
      .from('game_match_groups')
      .select('group_id, fixture_groups(name), game_matches(id, home_team, away_team, kickoff_time, status, competition_id)')
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
    if (
      competitionId &&
      (gmRaw as { competition_id?: string | null }).competition_id &&
      String((gmRaw as { competition_id?: string | null }).competition_id) !== competitionId
    ) {
      continue
    }
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

  const groupsWithCore = new Set(
    [...coreTeamsByGroup.entries()].filter(([, set]) => set.size > 0).map(([gid]) => gid)
  )

  // If a selected group has core teams, only include fixtures where at least one side matches
  // a core team (after canonical normalization). Groups without core keep linked-match behavior.
  const allowedMatchIdsByCoreRule = new Set<string>()
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
    const matchId = String(gmRaw.id)
    const homeNorm = normalizePreviewTeamName(String(gmRaw.home_team ?? ''))
    const awayNorm = normalizePreviewTeamName(String(gmRaw.away_team ?? ''))
    if (!groupsWithCore.has(row.group_id)) {
      allowedMatchIdsByCoreRule.add(matchId)
      continue
    }
    const coreNames = [...(coreTeamsByGroup.get(row.group_id) ?? new Set<string>())].map((t) =>
      normalizePreviewTeamName(t)
    )
    if (coreNames.includes(homeNorm) || coreNames.includes(awayNorm)) {
      allowedMatchIdsByCoreRule.add(matchId)
    }
  }

  const filteredMatches = matches.filter((m) => allowedMatchIdsByCoreRule.has(m.id))
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
  const fixtures = filteredMatches
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
      total_matches: filteredMatches.length,
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
    games_predicted: num(r.games_predicted),
    correct_winners: num(r.correct_winners),
    margin_points_total: num(r.margin_points_total),
  }))
  return { rows, error }
}

export async function fetchPoolMatchPredictionsForViewer(
  client: SupabaseClient,
  poolId: string,
  matchId: string
) {
  const { data, error } = await client.rpc('pool_match_predictions_for_viewer', {
    p_pool_id: poolId,
    p_match_id: matchId,
  })
  if (error) {
    return { rows: [] as PoolMatchPredictionViewerRpcRow[], error }
  }
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    user_id: String(r.user_id ?? ''),
    display_name: String(r.display_name ?? 'Player'),
    avatar_url: r.avatar_url == null ? null : String(r.avatar_url),
    avatar_letter: r.avatar_letter == null ? null : String(r.avatar_letter),
    avatar_colour: r.avatar_colour == null ? null : String(r.avatar_colour),
    is_viewer: Boolean(r.is_viewer),
    reveal_allowed: Boolean(r.reveal_allowed),
    predicted_winner: r.predicted_winner == null ? null : String(r.predicted_winner),
    predicted_margin:
      r.predicted_margin == null || r.predicted_margin === ''
        ? null
        : Math.trunc(Number(r.predicted_margin)),
    predicted_home_score:
      r.predicted_home_score == null || r.predicted_home_score === ''
        ? null
        : Math.trunc(Number(r.predicted_home_score)),
    predicted_away_score:
      r.predicted_away_score == null || r.predicted_away_score === ''
        ? null
        : Math.trunc(Number(r.predicted_away_score)),
    is_locked: r.is_locked == null ? null : Boolean(r.is_locked),
    locked_at: r.locked_at == null ? null : String(r.locked_at),
    submitted_at: r.submitted_at == null ? null : String(r.submitted_at),
    score_total_points:
      r.score_total_points == null || r.score_total_points === '' ? null : num(r.score_total_points),
    score_margin_difference:
      r.score_margin_difference == null || r.score_margin_difference === ''
        ? null
        : Math.trunc(Number(r.score_margin_difference)),
  }))
  return { rows, error: null }
}

/** Load fixtures for pool picks (includes prediction_cutoff_time for reveal rules). */
export async function fetchGameMatchesByIdsForPool(
  client: SupabaseClient,
  matchIds: string[]
) {
  if (matchIds.length === 0) {
    return { data: [] as GameMatchForPoolPicks[], error: null }
  }
  const { data, error } = await client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, prediction_cutoff_time'
    )
    .in('id', matchIds)
    .in('status', ['upcoming', 'locked', 'completed'])

  return {
    data: ((data as GameMatchForPoolPicks[] | null) ?? []).sort(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    ),
    error,
  }
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

export type GameMatchGroupLink = { match_id: string; group_id: string }

export async function fetchGameMatchGroupLinksForGroups(client: SupabaseClient, groupIds: string[]) {
  const ids = [...new Set(groupIds.filter(Boolean))]
  if (ids.length === 0) {
    return { links: [] as GameMatchGroupLink[], error: null as Error | null }
  }
  const { data, error } = await client.from('game_match_groups').select('match_id, group_id').in('group_id', ids)
  if (error) return { links: [] as GameMatchGroupLink[], error: new Error(error.message) }
  const links = ((data as GameMatchGroupLink[] | null) ?? []).map((r) => ({
    match_id: String(r.match_id),
    group_id: String(r.group_id),
  }))
  return { links, error: null }
}

export async function fetchFixtureGroupTeamsForGroups(client: SupabaseClient, groupIds: string[]) {
  const ids = [...new Set(groupIds.filter(Boolean))]
  if (ids.length === 0) {
    return { coreTeamsByGroupId: new Map<string, Set<string>>(), error: null as Error | null }
  }
  const { data, error } = await client.from('fixture_group_teams').select('group_id, team_name').in('group_id', ids)
  if (error) {
    const msg = error.message ?? ''
    if (error.code === '42P01' || msg.includes('does not exist')) {
      return { coreTeamsByGroupId: new Map<string, Set<string>>(), error: null }
    }
    return { coreTeamsByGroupId: new Map<string, Set<string>>(), error: new Error(error.message) }
  }
  const coreTeamsByGroupId = new Map<string, Set<string>>()
  for (const row of (data as { group_id: string; team_name: string | null }[] | null) ?? []) {
    const t = (row.team_name ?? '').trim()
    if (!t) continue
    if (!coreTeamsByGroupId.has(row.group_id)) coreTeamsByGroupId.set(row.group_id, new Set())
    coreTeamsByGroupId.get(row.group_id)!.add(t)
  }
  return { coreTeamsByGroupId, error: null }
}

/** All fixture group aliases (cache once; filter client-side by selected groups). */
export async function fetchFixtureGroupAliasesMap(client: SupabaseClient) {
  const { data, error } = await client.from('fixture_group_aliases').select('group_id, alias')
  if (error) return { map: new Map<string, string[]>(), error: new Error(error.message) }
  const map = new Map<string, string[]>()
  for (const row of (data as { group_id: string; alias: string | null }[] | null) ?? []) {
    const a = (row.alias ?? '').trim()
    if (!a) continue
    const list = map.get(row.group_id) ?? []
    list.push(a)
    map.set(row.group_id, list)
  }
  return { map, error: null }
}

/** Row counts per group for optional “Western Cape (24 teams)” labels. */
export async function fetchFixtureGroupTeamCounts(client: SupabaseClient) {
  const { data, error } = await client.from('fixture_group_teams').select('group_id')
  if (error) {
    const msg = error.message ?? ''
    if (error.code === '42P01' || msg.includes('does not exist')) {
      return { counts: new Map<string, number>(), error: null as Error | null }
    }
    return { counts: new Map<string, number>(), error: new Error(error.message) }
  }
  const counts = new Map<string, number>()
  for (const row of (data as { group_id: string }[] | null) ?? []) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1)
  }
  return { counts, error: null }
}
