'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildTeamAliasResolverMap } from '@/lib/team-aliases-db'
import {
  deletePool,
  fetchFixtureGroups,
  fetchMyPools,
  fetchPoolGroups,
  fetchPoolJoinRequests,
  fetchPoolLeaderboard,
  type PoolLeaderboardRow,
  previewPoolGroups,
  removePoolMember,
  requestJoinPool,
  reviewPoolJoinRequest,
  searchPublicPools,
  setPoolGroups,
  upsertPoolMatches,
  type FixtureGroupRow,
  type PoolJoinRequestRow,
  type PoolRow,
} from '@/lib/pools'
import { fetchGameMatchesForCommunityHub, type GameMatch } from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'
import { normalizeTeamKey, normalizeTeamKeyLoose, type TeamRow } from '@/lib/team-name-match'

function teamVs(m: GameMatch) {
  return `${m.home_team} vs ${m.away_team}`
}

const MAX_USER_POOLS = 3
const GROUP_TYPE_ORDER = ['prestige', 'province', 'league', 'festival', 'custom'] as const
const GROUP_TYPE_LABEL: Record<string, string> = {
  prestige: 'Prestige',
  province: 'Province',
  league: 'League',
  festival: 'Festival',
  custom: 'Custom',
}
const KNOWN_TEAM_ALIAS_TO_CANONICAL: Record<string, string> = {
  'paarl boys': 'Paarl Boys High',
  'paarl gim': 'Paarl Gimnasium',
  affies: 'Afrikaans Hoer Seuns',
}

export default function ManagePoolsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [publicRows, setPublicRows] = useState<Record<string, unknown>[]>([])
  const [joinRequests, setJoinRequests] = useState<PoolJoinRequestRow[]>([])
  const [allMatches, setAllMatches] = useState<GameMatch[]>([])
  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroupRow[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [createSelectedGroupIds, setCreateSelectedGroupIds] = useState<string[]>([])
  const [leaderRows, setLeaderRows] = useState<PoolLeaderboardRow[]>([])

  const [createName, setCreateName] = useState('')
  const [createPublic, setCreatePublic] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [searching, setSearching] = useState(false)
  const [savingMatches, setSavingMatches] = useState(false)
  const [savingGroups, setSavingGroups] = useState(false)
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [deletingPoolId, setDeletingPoolId] = useState<string | null>(null)
  const [createPreview, setCreatePreview] = useState<{
    total_matches: number
    teams: string[]
    fixtures: { match_id: string; home_team: string; away_team: string; kickoff_time: string; group_names: string[] }[]
  } | null>(null)
  const [editPreview, setEditPreview] = useState<{
    total_matches: number
    teams: string[]
    fixtures: { match_id: string; home_team: string; away_team: string; kickoff_time: string; group_names: string[] }[]
  } | null>(null)
  const [createPreviewLoading, setCreatePreviewLoading] = useState(false)
  const [editPreviewLoading, setEditPreviewLoading] = useState(false)
  const [teamAliasMap, setTeamAliasMap] = useState<Map<string, string>>(new Map())

  const selectedPool = useMemo(() => myPools.find((p) => p.id === selectedPoolId) ?? null, [myPools, selectedPoolId])
  const totalPools = myPools.length
  const canCreatePool = isUserAdmin || totalPools < MAX_USER_POOLS
  const canJoinPool = isUserAdmin || totalPools < MAX_USER_POOLS
  const hasReachedPoolLimit = !isUserAdmin && totalPools >= MAX_USER_POOLS
  const createNameValid = createName.trim().length >= 3
  const isSelectedPoolAdmin = Boolean(user && selectedPool && selectedPool.admin_user_id === user.id)
  const createGroupIds = useMemo(
    () => createSelectedGroupIds.filter((id) => fixtureGroups.some((g) => g.id === id)),
    [createSelectedGroupIds, fixtureGroups]
  )
  const groupedFixtureGroups = useMemo(() => {
    const normalized = fixtureGroups.map((g) => {
      const t = (g.group_type ?? 'custom').toLowerCase()
      const groupType = GROUP_TYPE_ORDER.includes(t as (typeof GROUP_TYPE_ORDER)[number]) ? t : 'custom'
      return { ...g, group_type: groupType }
    })
    return GROUP_TYPE_ORDER.map((type) => ({
      type,
      label: GROUP_TYPE_LABEL[type],
      items: normalized
        .filter((g) => g.group_type === type)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.items.length > 0)
  }, [fixtureGroups])

  const loadPools = useCallback(async (explicitUserId?: string) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = explicitUserId ?? sessionData.session?.user?.id
    if (!userId) return
    const result = await fetchMyPools(supabase, userId)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setMyPools(result.pools)
  }, [])

  const loadPoolDetails = useCallback(async () => {
    if (!selectedPoolId) return
    setRequestsLoading(true)
    const [reqRes, poolGroupsRes, leaderRes] = await Promise.all([
      fetchPoolJoinRequests(supabase, selectedPoolId),
      fetchPoolGroups(supabase, selectedPoolId),
      fetchPoolLeaderboard(supabase, selectedPoolId),
    ])
    if (!reqRes.error) setJoinRequests(reqRes.rows)
    if (!poolGroupsRes.error) setSelectedGroupIds(poolGroupsRes.rows.map((g) => g.id))
    if (!leaderRes.error) setLeaderRows(leaderRes.rows)
    setRequestsLoading(false)
  }, [selectedPoolId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserIsAdmin(supabase, session.user.id).then(({ isAdmin }) => setIsUserAdmin(isAdmin))
      } else {
        setIsUserAdmin(false)
      }
      setAuthReady(true)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
      if (event === 'SIGNED_OUT') {
        setMyPools([])
        setSelectedPoolId(null)
        setIsUserAdmin(false)
      } else if (session?.user) {
        const adminRes = await fetchUserIsAdmin(supabase, session.user.id)
        setIsUserAdmin(adminRes.isAdmin)
        await loadPools(session.user.id)
      }
    })
    return () => subscription.unsubscribe()
  }, [loadPools])

  useEffect(() => {
    void loadPools()
  }, [loadPools])

  useEffect(() => {
    setSelectedPoolId((prev) => prev ?? myPools[0]?.id ?? null)
  }, [myPools])

  useEffect(() => {
    fetchGameMatchesForCommunityHub(supabase, 250).then(({ data }) => setAllMatches(data))
    fetchFixtureGroups(supabase).then(({ rows, error }) => {
      setFixtureGroups(rows)
      if (error) {
        setMessage(`Could not load fixture groups: ${error.message}`)
      }
    })
    void (async () => {
      const [aliasRes, teamsRes] = await Promise.all([
        supabase.from('team_aliases').select('*'),
        supabase.from('teams').select('id, name'),
      ])
      const aliases = (aliasRes.data as Record<string, unknown>[] | null) ?? []
      const teams = (teamsRes.data as TeamRow[] | null) ?? []
      setTeamAliasMap(buildTeamAliasResolverMap(aliases, teams))
    })()
  }, [])

  useEffect(() => {
    if (!inviteCopied) return
    const id = window.setTimeout(() => setInviteCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [inviteCopied])

  useEffect(() => {
    void loadPoolDetails()
  }, [loadPoolDetails])

  useEffect(() => {
    const ids = [...new Set(createGroupIds)]
    if (ids.length === 0) {
      setCreatePreview(null)
      return
    }
    setCreatePreviewLoading(true)
    previewPoolGroups(supabase, ids).then(({ preview, error }) => {
      if (error) {
        setMessage(error.message)
        setCreatePreview(null)
      } else {
        setCreatePreview(preview)
      }
      setCreatePreviewLoading(false)
    })
  }, [createGroupIds])

  useEffect(() => {
    const ids = [...new Set(selectedGroupIds)]
    if (ids.length === 0) {
      setEditPreview(null)
      return
    }
    setEditPreviewLoading(true)
    previewPoolGroups(supabase, ids).then(({ preview, error }) => {
      if (error) {
        setMessage(error.message)
        setEditPreview(null)
      } else {
        setEditPreview(preview)
      }
      setEditPreviewLoading(false)
    })
  }, [selectedGroupIds])

  async function onCreatePool() {
    if (!createNameValid || !canCreatePool) return
    setCreating(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('create_pool', {
        p_name: createName.trim(),
        p_is_public: createPublic,
      })
      const pool = data as PoolRow | null
      if (error || !pool) {
        setMessage(error?.message ?? 'Could not create pool.')
        return
      }
      if (createGroupIds.length === 0) {
        setMessage('Select at least one fixture group.')
        return
      }
      const setGroupsRes = await setPoolGroups(supabase, pool.id, createGroupIds)
      if (setGroupsRes.error) {
        setMessage(setGroupsRes.error.message)
        return
      }
      setCreateName('')
      setCreatePublic(false)
      setCreateSelectedGroupIds([])
      await loadPools()
      setSelectedPoolId(pool.id)
      setMessage('Pool created.')
    } finally {
      setCreating(false)
    }
  }

  async function onSearchPools() {
    if (!canJoinPool) {
      setMessage(`You have reached the limit of ${MAX_USER_POOLS} pools.`)
      return
    }
    setSearching(true)
    const { rows, error } = await searchPublicPools(supabase, searchQuery)
    setSearching(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setPublicRows(rows)
  }

  async function onRequestJoin(poolId: string) {
    if (!canJoinPool) {
      setMessage(`You have reached the limit of ${MAX_USER_POOLS} pools.`)
      return
    }
    const { error } = await requestJoinPool(supabase, poolId)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Join request sent to pool admin.')
  }

  async function onReview(requestId: string, action: 'approve' | 'reject') {
    const { error } = await reviewPoolJoinRequest(supabase, requestId, action)
    if (error) {
      setMessage(error.message)
      return
    }
    await loadPoolDetails()
  }

  async function onRemoveMember(userId: string) {
    if (!selectedPoolId) return
    const { error } = await removePoolMember(supabase, selectedPoolId, userId)
    if (error) {
      setMessage(error.message)
      return
    }
    await loadPoolDetails()
  }

  async function onSaveMatches() {
    if (!selectedPoolId) return
    setSavingGroups(true)
    const { error } = await setPoolGroups(supabase, selectedPoolId, selectedGroupIds)
    setSavingGroups(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Fixture groups saved.')
    await loadPoolDetails()
  }

  async function onDeletePool() {
    if (!selectedPool || !user || selectedPool.admin_user_id !== user.id) return
    const confirmed = window.confirm('Are you sure you want to delete this pool?')
    if (!confirmed) return

    setDeletingPoolId(selectedPool.id)
    const deletingId = selectedPool.id
    const { error } = await deletePool(supabase, deletingId)
    setDeletingPoolId(null)
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Pool deleted')
    await loadPools()
    setSelectedPoolId((prev) => (prev === deletingId ? null : prev))
  }

  async function copyInviteLink() {
    if (!selectedPool || typeof window === 'undefined') return
    const url = `${window.location.origin}/pools/join/${selectedPool.invite_token}`
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
    } catch {
      setMessage('Could not copy invite link.')
    }
  }

  function renderPreviewPanel(params: {
    title?: string
    selectedCount: number
    loading: boolean
    preview: {
      total_matches: number
      teams: string[]
      fixtures: { match_id: string; home_team: string; away_team: string; kickoff_time: string; group_names: string[] }[]
    } | null
  }) {
    const { title = 'Preview selected groups', selectedCount, loading, preview } = params
    const hasFixtures = (preview?.total_matches ?? 0) > 0
    const normalizeTeamName = (name: string): string => {
      const trimmed = name.trim()
      if (!trimmed) return ''
      const key = normalizeTeamKey(trimmed)
      const loose = normalizeTeamKeyLoose(trimmed)
      const viaTeamAliases = teamAliasMap.get(key) ?? (loose ? teamAliasMap.get(loose) : undefined)
      if (viaTeamAliases) return viaTeamAliases
      const viaKnownAliases = KNOWN_TEAM_ALIAS_TO_CANONICAL[key] ?? (loose ? KNOWN_TEAM_ALIAS_TO_CANONICAL[loose] : undefined)
      return viaKnownAliases ?? trimmed
    }
    const canonicalTeams = [...new Set((preview?.teams ?? []).map(normalizeTeamName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    )
    return (
      <div className="rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-black text-gray-900">{title}</h3>
        {selectedCount === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Select one or more fixture groups to preview included teams and fixtures.
          </p>
        ) : loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading preview…</p>
        ) : !hasFixtures ? (
          <p className="mt-2 text-sm text-gray-500">No fixtures found for the selected groups yet.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-gray-600">Total fixtures included: {preview?.total_matches ?? 0}</p>
            <h4 className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-600">Core teams included</h4>
            <p className="mt-1 text-[11px] text-gray-500">
              These are the selected province/league teams. Fixtures may also include opponents from outside the selected province or league.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {canonicalTeams.map((t) => (
                <span key={t} className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  {t}
                </span>
              ))}
            </div>
            <h4 className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-600">Fixtures included</h4>
            <p className="mt-1 text-[11px] text-gray-500">
              These fixtures include games involving the selected teams, even when they play teams outside the province or league.
            </p>
            <div className="mt-2 space-y-1.5">
              {(preview?.fixtures ?? []).map((f) => (
                <div key={f.match_id} className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs">
                  <p className="font-semibold text-gray-900">
                    {new Date(f.kickoff_time).toLocaleString()} — {f.home_team} vs {f.away_team}
                  </p>
                  <p className="mt-1 text-gray-600">{f.group_names.join(', ')}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (!authReady || loading) {
    return <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12"><p className="text-sm text-gray-500">Loading…</p></main>
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Manage pools</h1>
        <p className="mt-3 text-sm text-gray-600">Log in to manage pools.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Manage pools</h1>
        <Link href="/pools" className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800">Back to pools</Link>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">{message}</p> : null}

      <section className="mt-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">Search public pools</h2>
          <p className="mt-1 text-xs text-gray-500">
            {isUserAdmin ? 'Admin users can create and manage unlimited pools.' : `You can belong to up to ${MAX_USER_POOLS} pools.`}
          </p>
          {hasReachedPoolLimit ? (
            <p className="mt-2 text-xs font-semibold text-red-700">You have reached the limit of 3 pools.</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <input
              type="search"
              value={searchQuery}
              disabled={!canJoinPool}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm disabled:bg-gray-100"
            />
            <button
              type="button"
              disabled={!canJoinPool || searching}
              onClick={() => void onSearchPools()}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 disabled:opacity-50"
            >
              Search
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {publicRows.map((r) => {
              const id = String(r.id ?? '')
              const name = String(r.name ?? 'Pool')
              return (
                <div key={id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{name}</p>
                  <button
                    type="button"
                    disabled={!canJoinPool}
                    onClick={() => void onRequestJoin(id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
                  >
                    Request join
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">Create pool</h2>
          <p className="mt-1 text-xs text-gray-500">
            {isUserAdmin ? 'Admin users can create and manage unlimited pools.' : `You can belong to up to ${MAX_USER_POOLS} pools.`}
          </p>
          {hasReachedPoolLimit ? (
            <p className="mt-2 text-xs font-semibold text-red-700">You have reached the limit of 3 pools.</p>
          ) : null}
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Pool name"
            disabled={!canCreatePool}
            className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm disabled:bg-gray-100"
          />
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={createPublic} onChange={(e) => setCreatePublic(e.target.checked)} disabled={!canCreatePool} />
            Public/searchable pool
          </label>
          <div className="mt-3 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Fixture groups</p>
            <div className="mt-2 space-y-3">
              {groupedFixtureGroups.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No fixture groups found. Create groups in Admin {'>'} Fixture groups / leagues.
                </p>
              ) : (
                groupedFixtureGroups.map((group) => (
                  <div key={group.type}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{group.label}</p>
                    <div className="mt-1 space-y-1.5">
                      {group.items.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            disabled={!canCreatePool}
                            checked={createGroupIds.includes(g.id)}
                            onChange={(e) =>
                              setCreateSelectedGroupIds((prev) =>
                                e.target.checked ? [...new Set([...prev, g.id])] : prev.filter((id) => id !== g.id)
                              )
                            }
                          />
                          <span>{g.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void onCreatePool()}
              disabled={!canCreatePool || creating || !createNameValid || createGroupIds.length === 0}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create pool'}
            </button>
          </div>
        </div>

        <div>{renderPreviewPanel({ selectedCount: createGroupIds.length, loading: createPreviewLoading, preview: createPreview })}</div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">My pools</h2>
          <div className="mt-3 space-y-2">
            {myPools.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPoolId(p.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left ${p.id === selectedPoolId ? 'border-gray-900 bg-gray-100' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                  {p.admin_user_id === user.id ? <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">Admin</span> : null}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          {!selectedPool ? (
            <p className="text-sm text-gray-500">Select a pool to manage.</p>
          ) : !isSelectedPoolAdmin ? (
            <p className="text-sm text-gray-500">You are a member of this pool. Admin tools are available to the pool owner only.</p>
          ) : (
            <>
              <h2 className="text-lg font-black text-gray-900">{selectedPool.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyInviteLink()}
                  className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                >
                  Copy invite link
                </button>
                {inviteCopied ? <span className="text-sm font-medium text-emerald-800">Invite link copied.</span> : null}
                {selectedPool.admin_user_id === user.id ? (
                  <button
                    type="button"
                    onClick={() => void onDeletePool()}
                    disabled={deletingPoolId === selectedPool.id}
                    className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingPoolId === selectedPool.id ? 'Deleting...' : 'Delete pool'}
                  </button>
                ) : null}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Pending join requests</h3>
                {requestsLoading ? (
                  <p className="mt-2 text-sm text-gray-500">Loading requests…</p>
                ) : joinRequests.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No pending requests.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {joinRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                        <p className="text-sm text-gray-800">{r.display_name || 'Player'}</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void onReview(r.id, 'approve')} className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white">Approve</button>
                          <button type="button" onClick={() => void onReview(r.id, 'reject')} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Members</h3>
                <div className="mt-2 space-y-2">
                  {leaderRows.map((r) => (
                    <div key={r.user_id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <LetterAvatar
                          letter={r.avatar_letter}
                          colour={r.avatar_colour}
                          avatarUrl={r.avatar_url}
                          displayName={r.display_name}
                          name={r.display_name}
                          size={24}
                          className="ring-1 ring-gray-200"
                        />
                        <p className="text-sm text-gray-800">{r.display_name}</p>
                      </div>
                      {r.user_id !== selectedPool.admin_user_id ? (
                        <button type="button" onClick={() => void onRemoveMember(r.user_id)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800">Remove</button>
                      ) : (
                        <span className="text-xs font-semibold text-gray-500">Admin</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Selected fixture groups</h3>
                  <div className="mt-3 space-y-3">
                    {groupedFixtureGroups.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No fixture groups found. Create groups in Admin {'>'} Fixture groups / leagues.
                      </p>
                    ) : (
                      groupedFixtureGroups.map((group) => (
                        <div key={group.type}>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{group.label}</p>
                          <div className="mt-1 grid gap-2">
                            {group.items.map((m) => (
                              <label key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedGroupIds.includes(m.id)}
                                  onChange={(e) => {
                                    setSelectedGroupIds((prev) =>
                                      e.target.checked ? [...new Set([...prev, m.id])] : prev.filter((id) => id !== m.id)
                                    )
                                  }}
                                />
                                <span className="flex-1 text-gray-800">{m.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onSaveMatches()}
                    disabled={savingGroups}
                    className="mt-3 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingGroups ? 'Saving…' : 'Save fixture groups'}
                  </button>
                  <p className="mt-2 text-xs text-gray-500">Pool effective matches are auto-derived from selected groups.</p>
                </div>
                <div>{renderPreviewPanel({ selectedCount: selectedGroupIds.length, loading: editPreviewLoading, preview: editPreview })}</div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
