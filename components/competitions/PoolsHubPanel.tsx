'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import PoolPicksSection from '@/components/pools/PoolPicksSection'
import PoolPredictTabSection from '@/components/pools/PoolPredictTabSection'
import {
  canUserCreatePoolInCompetition,
  countUserAdminPoolsForCompetition,
  createPool,
  fetchEffectivePoolMatches,
  fetchPoolGroups,
  fetchPoolTeams,
  fetchMyPools,
  fetchPoolJoinRequests,
  fetchPoolLeaderboard,
  removePoolMember,
  requestJoinPool,
  reviewPoolJoinRequest,
  searchPublicPools,
  upsertPoolMatches,
  MAX_POOLS_PER_COMPETITION,
  POOL_CREATION_LIMIT_MESSAGE,
  type PoolJoinRequestRow,
  type PoolLeaderboardRow,
  type PoolMemberRow,
  type PoolRow,
  type PoolSearchRow,
  type PoolTeamRow,
} from '@/lib/pools'
import { buildPoolJoinPath } from '@/lib/pool-invite-path'
import {
  formatPoolJoinCodeDisplay,
  validatePoolJoinCodeInput,
} from '@/lib/pool-join-code'
import type { CompetitionMode } from '@/lib/competitions'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { fetchGameMatchesForCommunityHub, type GameMatch } from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'

type UserProfileMini = { id: string; display_name: string | null }
type PoolDetailTab = 'leaderboard' | 'picks' | 'predict'

function teamVs(m: GameMatch) {
  return `${m.home_team} vs ${m.away_team}`
}

function requestDisplayName(r: PoolJoinRequestRow, profilesById: Record<string, UserProfileMini>): string {
  return r.display_name?.trim() || profilesById[r.user_id]?.display_name?.trim() || 'Player'
}

const PENDING_POOL_INVITE_KEY = 'pending_pool_invite_id'

export type PoolsHubPanelProps = {
  competitionId: string
  competitionSlug: string
  competitionName?: string
  competitionMode: CompetitionMode
}

function PoolsPageContent({
  competitionId,
  competitionSlug,
  competitionName,
  competitionMode,
}: PoolsHubPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [myMemberships, setMyMemberships] = useState<PoolMemberRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [profilesById, setProfilesById] = useState<Record<string, UserProfileMini>>({})

  const [searchQuery, setSearchQuery] = useState('')
  const [publicRows, setPublicRows] = useState<PoolSearchRow[]>([])
  const [searching, setSearching] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createJoinCode, setCreateJoinCode] = useState('')
  const [createPublic, setCreatePublic] = useState(false)
  const [creating, setCreating] = useState(false)

  const [joinRequests, setJoinRequests] = useState<PoolJoinRequestRow[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)

  const [allMatches, setAllMatches] = useState<GameMatch[]>([])
  const [effectiveMatchIds, setEffectiveMatchIds] = useState<string[]>([])
  const [selectedPoolGroups, setSelectedPoolGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [savingMatches, setSavingMatches] = useState(false)

  const [inviteCopied, setInviteCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [initialSessionLoaded, setInitialSessionLoaded] = useState(false)

  const [leaderRows, setLeaderRows] = useState<PoolLeaderboardRow[]>([])
  const [leaderLoading, setLeaderLoading] = useState(false)
  const [poolTeamsRows, setPoolTeamsRows] = useState<PoolTeamRow[]>([])
  const [poolDetailTab, setPoolDetailTab] = useState<PoolDetailTab>('leaderboard')
  const [poolInfoModalOpen, setPoolInfoModalOpen] = useState(false)
  const showManagement = competitionMode === 'official_fixed_fixtures'
  const poolsBase = `/competitions/${competitionSlug}/pools`
  const createPoolPath = `${poolsBase}/create`
  const inviteFromUrl = (searchParams.get('invite') ?? '').trim()
  const schoolsCompetitionId =
    competitionSlug === SCHOOLS_COMPETITION_SLUG ? competitionId : null
  const myAdminPoolCount = useMemo(
    () =>
      user
        ? countUserAdminPoolsForCompetition(myPools, user.id, competitionId, schoolsCompetitionId)
        : 0,
    [competitionId, myPools, schoolsCompetitionId, user]
  )
  const canCreatePool = myAdminPoolCount < MAX_POOLS_PER_COMPETITION

  const membershipByPool = useMemo(() => {
    const map = new Map<string, PoolMemberRow>()
    for (const m of myMemberships) map.set(m.pool_id, m)
    return map
  }, [myMemberships])

  const selectedPool = useMemo(
    () => myPools.find((p) => p.id === selectedPoolId) ?? null,
    [myPools, selectedPoolId]
  )
  const isAdmin = Boolean(user && selectedPool && selectedPool.admin_user_id === user.id)
  const isPoolMember = Boolean(selectedPoolId && membershipByPool.has(selectedPoolId))
  const effectiveMatches = useMemo(() => {
    const byId = new Map(allMatches.map((m) => [m.id, m]))
    return effectiveMatchIds.map((id) => byId.get(id)).filter(Boolean) as GameMatch[]
  }, [allMatches, effectiveMatchIds])

  const sortedLeaderRows = useMemo(() => {
    const rows = [...leaderRows]
    rows.sort(
      (a, b) =>
        b.total_points - a.total_points ||
        a.total_margin_difference - b.total_margin_difference ||
        b.games_predicted - a.games_predicted ||
        a.display_name.localeCompare(b.display_name)
    )
    return rows
  }, [leaderRows])

  const loadPools = useCallback(async (explicitUserId?: string) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = explicitUserId ?? sessionData.session?.user?.id

    if (!userId) return

    const result = await fetchMyPools(supabase, userId, competitionId)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setMyPools(result.pools)
    setMyMemberships(result.memberships)
  }, [competitionId])

  const loadProfiles = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return
    const { data } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .in('id', unique)
    const next: Record<string, UserProfileMini> = {}
    for (const row of ((data as UserProfileMini[] | null) ?? [])) {
      next[row.id] = row
    }
    setProfilesById((prev) => ({ ...prev, ...next }))
  }, [])

  const loadPoolDetails = useCallback(async () => {
    if (!selectedPoolId) return
    setRequestsLoading(true)
    setLeaderLoading(true)
    const [reqRes, effRes, leaderRes, poolTeamsRes] = await Promise.all([
      fetchPoolJoinRequests(supabase, selectedPoolId),
      fetchEffectivePoolMatches(supabase, selectedPoolId),
      fetchPoolLeaderboard(supabase, selectedPoolId),
      fetchPoolTeams(supabase, selectedPoolId),
    ])
    const poolGroupsRes = await fetchPoolGroups(supabase, selectedPoolId)

    if (!reqRes.error) setJoinRequests(reqRes.rows)
    if (!effRes.error) {
      setEffectiveMatchIds(effRes.matchIds)
      setSelectedMatchIds(effRes.matchIds)
    }
    if (!leaderRes.error) setLeaderRows(leaderRes.rows)
    if (!poolGroupsRes.error) setSelectedPoolGroups(poolGroupsRes.rows.map((g) => ({ id: g.id, name: g.name })))
    if (!poolTeamsRes.error) setPoolTeamsRows(poolTeamsRes.rows)
    else setPoolTeamsRows([])
    await loadProfiles(reqRes.rows.map((r) => r.user_id).concat(leaderRes.rows.map((r) => r.user_id)))
    setRequestsLoading(false)
    setLeaderLoading(false)
  }, [selectedPoolId, loadProfiles])

  useEffect(() => {
    let cancelled = false
    const fallbackId = window.setTimeout(() => {
      if (cancelled) return
      setAuthReady(true)
      setLoading(false)
    }, 5000)

    const loadSession = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase.auth.getSession()
        if (error) console.error('Pools getSession error:', error)
        if (cancelled) return
        setUser(data.session?.user ?? null)
      } catch (err) {
        console.error('Pools getSession failed:', err)
      } finally {
        if (cancelled) return
        setInitialSessionLoaded(true)
        setAuthReady(true)
        setLoading(false)
      }
    }
    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return
      setAuthReady(true)
      setLoading(false)
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setMyPools([])
        setMyMemberships([])
        setSelectedPoolId(null)
      } else if (session?.user) {
        setUser(session.user)
        await loadPools(session.user.id)
      } else if (!initialSessionLoaded) {
        setUser(null)
      }
    })
    return () => {
      cancelled = true
      window.clearTimeout(fallbackId)
      subscription.unsubscribe()
    }
  }, [initialSessionLoaded, loadPools])

  useEffect(() => {
    void loadPools()
  }, [loadPools])

  useEffect(() => {
    setSelectedPoolId((prev) => prev ?? (myPools[0]?.id ?? null))
  }, [myPools])

  useEffect(() => {
    fetchGameMatchesForCommunityHub(supabase, 250, competitionId).then(({ data }) => setAllMatches(data))
  }, [competitionId])

  useEffect(() => {
    if (!inviteCopied) return
    const id = window.setTimeout(() => setInviteCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [inviteCopied])

  useEffect(() => {
    if (!codeCopied) return
    const id = window.setTimeout(() => setCodeCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [codeCopied])

  useEffect(() => {
    if (!authReady) return
    const pendingFromStorage =
      typeof window === 'undefined' ? '' : (window.localStorage.getItem(PENDING_POOL_INVITE_KEY) ?? '').trim()
    const invitePoolId = inviteFromUrl || pendingFromStorage
    if (!invitePoolId) return

    const handleInvite = async () => {
      if (!user) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PENDING_POOL_INVITE_KEY, invitePoolId)
        }
        router.replace('/login')
        return
      }

      const { data: memberRow, error: memberErr } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('pool_id', invitePoolId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (memberErr) {
        setMessage(memberErr.message)
        return
      }
      if (memberRow?.pool_id) {
        setMessage('You are already a member of this pool.')
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(PENDING_POOL_INVITE_KEY)
        }
        if (inviteFromUrl) router.replace(poolsBase)
        return
      }

      const { data: poolRow } = await supabase
        .from('pools')
        .select('name')
        .eq('id', invitePoolId)
        .maybeSingle()
      const poolName = String((poolRow as { name?: string } | null)?.name ?? 'pool')

      const { error } = await requestJoinPool(supabase, invitePoolId)
      if (error) {
        setMessage(error.message)
        return
      }
      setMessage(`Request sent to join ${poolName}`)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(PENDING_POOL_INVITE_KEY)
      }
      if (inviteFromUrl) router.replace(poolsBase)
      await loadPools(user.id)
    }

    void handleInvite()
  }, [authReady, inviteFromUrl, loadPools, router, user])

  useEffect(() => {
    void loadPoolDetails()
  }, [loadPoolDetails])

  useEffect(() => {
    setPoolDetailTab('leaderboard')
    setPoolInfoModalOpen(false)
  }, [selectedPoolId])

  async function copyInviteLink() {
    if (!selectedPool || typeof window === 'undefined' || !user) return
    const url = `${window.location.origin}${buildPoolJoinPath(selectedPool.invite_token, user.id, competitionSlug)}`
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
    } catch {
      setMessage('Could not copy link. Try copying from the address bar after opening the invite page.')
    }
  }

  async function copyJoinCode() {
    if (!selectedPool?.join_code || typeof window === 'undefined') return
    try {
      await navigator.clipboard.writeText(formatPoolJoinCodeDisplay(selectedPool.join_code))
      setCodeCopied(true)
    } catch {
      setMessage('Could not copy pool code.')
    }
  }

  const createNameValid = createName.trim().length >= 3
  const createJoinCodeError = createJoinCode.trim()
    ? validatePoolJoinCodeInput(createJoinCode)
    : null

  async function onCreatePool() {
    if (!createNameValid || !canCreatePool || createJoinCodeError) {
      if (!canCreatePool) setMessage(POOL_CREATION_LIMIT_MESSAGE)
      return
    }
    setCreating(true)
    setMessage('')
    try {
      const { pool, error } = await createPool(supabase, {
        name: createName.trim(),
        isPublic: createPublic,
        competitionId,
        joinCode: createJoinCode.trim() || null,
      })
      if (error) {
        setMessage(error.message)
        return
      }
      if (!pool) {
        setMessage('Could not create pool.')
        return
      }
      setCreateName('')
      setCreateJoinCode('')
      setCreatePublic(false)
      await loadPools()
      setSelectedPoolId(pool.id)
      setMessage(
        `Pool created. Share code ${formatPoolJoinCodeDisplay(pool.join_code)} or copy the invite link.`
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create pool.')
    } finally {
      setCreating(false)
    }
  }

  async function onSearchPools() {
    setSearching(true)
    const { rows, error } = await searchPublicPools(supabase, searchQuery, competitionId)
    setSearching(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setPublicRows(rows)
  }

  async function onRequestJoin(poolId: string, joinCode?: string) {
    const { error } = await requestJoinPool(supabase, poolId, {
      joinCode: joinCode || undefined,
    })
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Join request sent to pool admin.')
    if (user) await loadPools(user.id)
  }

  async function onReview(requestId: string, action: 'approve' | 'reject') {
    const { error } = await reviewPoolJoinRequest(supabase, requestId, action)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(action === 'approve' ? 'Member approved.' : 'Join request rejected.')
    await loadPoolDetails()
  }

  async function onRemoveMember(userId: string) {
    if (!selectedPoolId) return
    const { error } = await removePoolMember(supabase, selectedPoolId, userId)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Member removed from pool.')
    await loadPoolDetails()
  }

  async function onSaveMatches() {
    if (!selectedPoolId) return
    setSavingMatches(true)
    const { error } = await upsertPoolMatches(supabase, selectedPoolId, selectedMatchIds)
    setSavingMatches(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Pool weekly matches saved.')
    await loadPoolDetails()
  }

  if (!authReady || loading) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-8 sm:px-6 md:py-12">
        <p className="text-sm text-gray-500">Loading pools…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-8 sm:px-6 md:py-12">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
          Pools{competitionName ? ` · ${competitionName}` : ''}
        </h1>
        <p className="mt-3 min-w-0 break-words text-sm text-gray-600">
          Log in to create pools, request to join, and track pool leaderboards.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-8 sm:px-6 md:py-12">
      <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
        Pools{competitionName ? ` · ${competitionName}` : ''}
      </h1>
      <p className="mt-2 min-w-0 break-words text-sm text-gray-600">
        Private prediction groups with admin approvals, weekly match selection, and pool-only leaderboards.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={createPoolPath}
          className="inline-flex rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          Create pool
        </Link>
      </div>
      {message ? (
        <p className="mt-4 min-w-0 break-words rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </p>
      ) : null}

      {myPools.length === 0 ? (
        <section className="mt-8 w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="min-w-0 break-words text-sm text-gray-700">
            {competitionMode === 'official_fixed_fixtures'
              ? 'Create your first pool for this competition.'
              : 'Create or join a pool.'}
          </p>
          <Link
            href={createPoolPath}
            className="mt-4 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            {competitionMode === 'official_fixed_fixtures' ? 'Create pool' : 'Create or join a pool'}
          </Link>
        </section>
      ) : null}

      {showManagement ? (
      <section className="mt-8 grid min-w-0 max-w-full gap-4 lg:grid-cols-2">
        <div className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black uppercase tracking-wide text-gray-900">Join / search pool</h2>
          <p className="mt-1 min-w-0 break-words text-xs text-gray-600">
            Enter a pool code, pool name, or paste an invite token.
          </p>
          <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter pool code or pool name"
              className="min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
            <button
              type="button"
              onClick={() => void onSearchPools()}
              disabled={searching}
              className="w-full shrink-0 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800 sm:w-auto"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {publicRows.map((r) => (
              <div
                key={r.id}
                className="flex min-w-0 max-w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900" title={r.name}>
                    {r.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatPoolJoinCodeDisplay(r.join_code)}
                    {r.competition_name ? ` · ${r.competition_name}` : ''}
                    {r.admin_display_name ? ` · ${r.admin_display_name}` : ''}
                    {` · ${r.member_count} members`}
                    {!r.is_public ? ' · Private' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onRequestJoin(r.id, r.join_code)}
                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800"
                >
                  Request join
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black uppercase tracking-wide text-gray-900">Create your own pool</h2>
          {!canCreatePool ? (
            <p className="mt-2 text-xs font-semibold text-red-700">{POOL_CREATION_LIMIT_MESSAGE}</p>
          ) : null}
          <div className="mt-3">
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Pool name (3–80 characters)"
              className="min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
            <input
              type="text"
              value={createJoinCode}
              onChange={(e) => setCreateJoinCode(e.target.value)}
              placeholder="Pool code (e.g. soccer1, cw2026) — optional"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 min-w-0 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
            {createJoinCodeError ? (
              <p className="mt-1 text-xs text-red-700">{createJoinCodeError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">4–20 letters and numbers. Auto-generated if blank.</p>
            )}
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-gray-900 focus:ring-red-700"
                  checked={createPublic}
                  onChange={(e) => setCreatePublic(e.target.checked)}
                />
                Public/searchable pool
              </label>
              <button
                type="button"
                onClick={() => void onCreatePool()}
                disabled={creating || !createNameValid || !canCreatePool || Boolean(createJoinCodeError)}
                className="shrink-0 self-end rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50 sm:self-auto"
              >
                {creating ? 'Creating...' : 'Create pool'}
              </button>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      <section className="mt-8 grid min-w-0 max-w-full gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">My pools</h2>
          <div className="mt-3 space-y-2">
            {myPools.length === 0 ? (
              <p className="min-w-0 break-words">No pools yet.</p>
            ) : (
              myPools.map((pool) => (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => setSelectedPoolId(pool.id)}
                  className={`w-full max-w-full min-w-0 rounded-xl border px-3 py-2 text-left ${
                    pool.id === selectedPoolId ? 'border-gray-900 bg-gray-100' : 'border-gray-200'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-medium">{pool.name}</span>
                    {pool.admin_user_id === user.id ? (
                      <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        Admin
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{pool.is_public ? 'Public' : 'Private'} pool</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          {!selectedPool ? (
            <p className="min-w-0 break-words text-sm text-gray-500">Select a pool to view details.</p>
          ) : (
            <>
              <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h2 className="min-w-0 break-words text-lg font-black text-gray-900">{selectedPool.name}</h2>
                  {selectedPool.admin_user_id === user.id ? (
                    <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                      Admin
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {isAdmin ? (
                    <>
                      <span className="text-xs font-semibold text-gray-600">You are admin</span>
                      {selectedPool.join_code ? (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-800">
                          {formatPoolJoinCodeDisplay(selectedPool.join_code)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyJoinCode()}
                        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50"
                      >
                        Copy code
                      </button>
                      {codeCopied ? (
                        <span className="text-xs font-medium text-emerald-700">Code copied</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyInviteLink()}
                        className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        Copy invite link
                      </button>
                      {inviteCopied ? (
                        <span className="text-xs font-medium text-emerald-700">Link copied</span>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs font-semibold text-gray-600">Member view</p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex min-w-0 max-w-full flex-col gap-2 border-b border-gray-200 pb-1 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap">
                  <div className="inline-flex gap-2 pr-1">
                    <button
                      type="button"
                      onClick={() => setPoolDetailTab('leaderboard')}
                      className={`rounded-t-lg px-4 py-2 text-sm font-bold transition ${
                        poolDetailTab === 'leaderboard'
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Leaderboard
                    </button>
                    {isPoolMember ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPoolDetailTab('picks')}
                          className={`rounded-t-lg px-4 py-2 text-sm font-bold transition ${
                            poolDetailTab === 'picks'
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          Pool Picks
                        </button>
                        <button
                          type="button"
                          onClick={() => setPoolDetailTab('predict')}
                          className={`rounded-t-lg px-4 py-2 text-sm font-bold transition ${
                            poolDetailTab === 'predict'
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          Predict
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className="inline-block max-w-[11rem] truncate rounded-t-lg px-4 py-2 text-sm font-semibold text-gray-400 sm:max-w-none sm:whitespace-normal"
                          title="Join this pool to see pool picks"
                        >
                          Pool Picks (members only)
                        </span>
                        <span
                          className="inline-block max-w-[11rem] truncate rounded-t-lg px-4 py-2 text-sm font-semibold text-gray-400 sm:max-w-none sm:whitespace-normal"
                          title="Join this pool to enter predictions for this pool"
                        >
                          Predict (members only)
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPoolInfoModalOpen(true)}
                  aria-expanded={poolInfoModalOpen}
                  aria-controls="pool-info-dialog"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto sm:justify-start"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4 shrink-0 text-gray-600"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Pool info
                </button>
              </div>

              {poolDetailTab === 'leaderboard' ? (
                <>
                  <div className="mt-6 min-w-0 max-w-full">
                    <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Leaderboard</h3>
                    <p className="mt-1 min-w-0 break-words text-xs text-gray-500">
                      Pool members only, scored on games in this pool&apos;s fixture scope (groups and optional team
                      filter).
                    </p>
                    {leaderLoading ? (
                      <p className="mt-3 text-sm text-gray-500">Loading leaderboard…</p>
                    ) : (
                      <div className="mt-3 w-full max-w-full overflow-x-auto rounded-xl border border-gray-200">
                        <table className="min-w-[640px] w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600">
                              <th className="whitespace-nowrap px-3 py-2">Rank</th>
                              <th className="whitespace-nowrap px-3 py-2">Player</th>
                              <th className="whitespace-nowrap px-3 py-2">Total pts</th>
                              <th className="whitespace-nowrap px-3 py-2">Correct winners</th>
                              <th className="whitespace-nowrap px-3 py-2">Margin pts</th>
                              <th className="whitespace-nowrap px-3 py-2">Games</th>
                              <th className="whitespace-nowrap px-3 py-2">Avg margin diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLeaderRows.map((r, i) => {
                              const joinedAt = membershipByPool.get(selectedPool.id)?.joined_at
                              const afterJoin = joinedAt ? new Date(r.joined_at) >= new Date(joinedAt) : true
                              const avgMd =
                                r.average_margin_difference == null
                                  ? '—'
                                  : r.average_margin_difference.toFixed(2)
                              return (
                                <tr key={r.user_id} className="border-b border-gray-50">
                                  <td className="whitespace-nowrap px-3 py-2 text-xs font-bold text-gray-500">
                                    #{i + 1}
                                  </td>
                                  <td className="max-w-[11rem] px-3 py-2 sm:max-w-none">
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <LetterAvatar
                                          letter={r.avatar_letter}
                                          colour={r.avatar_colour}
                                          avatarUrl={r.avatar_url}
                                          displayName={r.display_name}
                                          name={r.display_name}
                                          size={28}
                                          className="shrink-0 ring-1 ring-gray-200"
                                        />
                                        <span className="min-w-0 truncate font-semibold text-gray-900" title={r.display_name}>
                                          {r.display_name}
                                        </span>
                                      </div>
                                      {!afterJoin ? (
                                        <span className="text-[10px] text-gray-500">Late joiner</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                                    {r.total_points.toFixed(1)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">
                                    {r.correct_winners}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">
                                    {r.margin_points_total.toFixed(1)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">
                                    {r.games_predicted}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">{avgMd}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 min-w-0 max-w-full">
                    <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Weekly matches</h3>
                    <p className="mt-1 min-w-0 break-words text-xs text-gray-500">
                      Pool fixture scope (prestige fallback when no groups selected).
                    </p>
                    {effectiveMatches.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-500">No pool matches in scope yet.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {effectiveMatches.map((m) => (
                          <div
                            key={m.id}
                            className="min-w-0 max-w-full break-words rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800"
                          >
                            {teamVs(m)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : poolDetailTab === 'picks' ? (
                isPoolMember && user ? (
                  <PoolPicksSection
                    supabase={supabase}
                    poolId={selectedPool.id}
                    userId={user.id}
                    isMember={isPoolMember}
                  />
                ) : (
                  <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Pool picks are only visible to pool members.
                  </p>
                )
              ) : poolDetailTab === 'predict' ? (
                isPoolMember && user ? (
                  <PoolPredictTabSection effectiveMatchIds={effectiveMatchIds} user={user} />
                ) : (
                  <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Predictions for this pool are available to members only.
                  </p>
                )
              ) : null}

              {poolInfoModalOpen && selectedPool ? (
                <div
                  className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
                  role="presentation"
                  onClick={() => setPoolInfoModalOpen(false)}
                >
                  <div
                    id="pool-info-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pool-info-dialog-title"
                    className="max-h-[min(85vh,560px)] w-full max-w-md overflow-x-hidden overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 sm:px-5">
                      <h2 id="pool-info-dialog-title" className="min-w-0 pr-2 text-lg font-black text-gray-900">
                        {selectedPool.name} info
                      </h2>
                      <button
                        type="button"
                        onClick={() => setPoolInfoModalOpen(false)}
                        className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    <div className="space-y-6 px-4 py-4 sm:px-5 sm:py-5">
                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Included groups</h3>
                        {selectedPoolGroups.length === 0 ? (
                          <p className="mt-2 text-sm text-gray-600">No groups selected</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedPoolGroups.map((g) => (
                              <span
                                key={g.id}
                                className="max-w-full truncate rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700"
                                title={g.name}
                              >
                                {g.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>
                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Pool teams</h3>
                        {poolTeamsRows.length === 0 ? (
                          <p className="mt-2 text-sm text-gray-600">No specific teams selected</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {poolTeamsRows.map((r) => (
                              <span
                                key={r.id}
                                className="max-w-full truncate rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800"
                                title={r.team_name}
                              >
                                {r.team_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>
                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">How fixtures are included</h3>
                        <p className="mt-2 min-w-0 break-words text-sm leading-relaxed text-gray-600">
                          This pool includes matches from selected groups and/or matches involving selected teams.
                        </p>
                      </section>
                    </div>
                  </div>
                </div>
              ) : null}

              {showManagement && isAdmin ? (
                <div className="mt-6">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Join requests</h3>
                  {requestsLoading ? (
                    <p className="mt-2 text-sm text-gray-500">Loading requests…</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {joinRequests.length === 0 ? (
                        <p className="text-sm text-gray-500">No pending requests.</p>
                      ) : (
                        joinRequests.map((r) => (
                            <div
                              key={r.id}
                              className="flex min-w-0 max-w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                            >
                              <p className="min-w-0 truncate text-sm text-gray-800" title={requestDisplayName(r, profilesById)}>
                                {requestDisplayName(r, profilesById)}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void onReview(r.id, 'approve')}
                                  className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onReview(r.id, 'reject')}
                                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {showManagement && isAdmin ? (
                <div className="mt-6">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Members</h3>
                  <div className="mt-2 space-y-2">
                    {leaderRows.map((r) => (
                      <div
                        key={r.user_id}
                        className="flex min-w-0 max-w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                      >
                        <p className="min-w-0 truncate text-sm text-gray-800" title={r.display_name}>
                          {r.display_name}
                        </p>
                        {r.user_id !== selectedPool.admin_user_id ? (
                          <button
                            type="button"
                            onClick={() => void onRemoveMember(r.user_id)}
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-gray-500">Admin</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

export default function PoolsHubPanel(props: PoolsHubPanelProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-4 py-12 text-slate-500 sm:px-6">
          Loading pools...
        </div>
      }
    >
      <PoolsPageContent {...props} />
    </Suspense>
  )
}
