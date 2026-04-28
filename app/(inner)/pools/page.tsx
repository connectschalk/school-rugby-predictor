'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import {
  fetchEffectivePoolMatches,
  fetchPoolGroups,
  fetchMyPools,
  fetchPoolJoinRequests,
  fetchPoolLeaderboard,
  removePoolMember,
  requestJoinPool,
  reviewPoolJoinRequest,
  searchPublicPools,
  upsertPoolMatches,
  type PoolJoinRequestRow,
  type PoolMemberRow,
  type PoolRow,
} from '@/lib/pools'
import { fetchGameMatchesForCommunityHub, type GameMatch } from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'

type LeaderMetric = 'total' | 'margin_total' | 'margin_avg'
type UserProfileMini = { id: string; display_name: string | null }

function teamVs(m: GameMatch) {
  return `${m.home_team} vs ${m.away_team}`
}

function requestDisplayName(r: PoolJoinRequestRow, profilesById: Record<string, UserProfileMini>): string {
  return r.display_name?.trim() || profilesById[r.user_id]?.display_name?.trim() || 'Player'
}

const PENDING_POOL_INVITE_KEY = 'pending_pool_invite_id'

function PoolsPageContent() {
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
  const [publicRows, setPublicRows] = useState<Record<string, unknown>[]>([])
  const [searching, setSearching] = useState(false)

  const [createName, setCreateName] = useState('')
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
  const [initialSessionLoaded, setInitialSessionLoaded] = useState(false)

  const [leaderRows, setLeaderRows] = useState<
    {
      user_id: string
      display_name: string
      avatar_url: string | null
      avatar_letter: string | null
      avatar_colour: string | null
      joined_at: string
      total_points: number
      total_margin_difference: number
      average_margin_difference: number | null
    }[]
  >([])
  const [leaderLoading, setLeaderLoading] = useState(false)
  const [leaderMetric, setLeaderMetric] = useState<LeaderMetric>('total')
  const showManagement = false
  const inviteFromUrl = (searchParams.get('invite') ?? '').trim()

  useEffect(() => {
    console.log('AUTH USER SET', user?.id)
  }, [user])

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
  const effectiveMatches = useMemo(() => {
    const byId = new Map(allMatches.map((m) => [m.id, m]))
    return effectiveMatchIds.map((id) => byId.get(id)).filter(Boolean) as GameMatch[]
  }, [allMatches, effectiveMatchIds])

  const currentWeekMatches = useMemo(() => {
    const now = new Date()
    const day = now.getUTCDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() + mondayOffset)
    const saturday = new Date(monday)
    saturday.setUTCDate(saturday.getUTCDate() + 5)
    return allMatches.filter((m) => {
      const d = new Date(m.kickoff_time)
      return d >= monday && d <= saturday
    })
  }, [allMatches])

  const sortedLeaderRows = useMemo(() => {
    const rows = [...leaderRows]
    if (leaderMetric === 'total') {
      rows.sort((a, b) => b.total_points - a.total_points || a.total_margin_difference - b.total_margin_difference)
    } else if (leaderMetric === 'margin_total') {
      rows.sort((a, b) => a.total_margin_difference - b.total_margin_difference || b.total_points - a.total_points)
    } else {
      rows.sort((a, b) => {
        const av = a.average_margin_difference ?? Number.POSITIVE_INFINITY
        const bv = b.average_margin_difference ?? Number.POSITIVE_INFINITY
        return av - bv || b.total_points - a.total_points
      })
    }
    return rows
  }, [leaderRows, leaderMetric])

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
    setMyMemberships(result.memberships)
  }, [])

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
    const [reqRes, effRes, leaderRes] = await Promise.all([
      fetchPoolJoinRequests(supabase, selectedPoolId),
      fetchEffectivePoolMatches(supabase, selectedPoolId),
      fetchPoolLeaderboard(supabase, selectedPoolId),
    ])
    const poolGroupsRes = await fetchPoolGroups(supabase, selectedPoolId)

    if (!reqRes.error) setJoinRequests(reqRes.rows)
    if (!effRes.error) {
      setEffectiveMatchIds(effRes.matchIds)
      setSelectedMatchIds(effRes.matchIds)
    }
    if (!leaderRes.error) setLeaderRows(leaderRes.rows)
    if (!poolGroupsRes.error) setSelectedPoolGroups(poolGroupsRes.rows.map((g) => ({ id: g.id, name: g.name })))
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
      console.log('AUTH EVENT', event, !!session?.user)
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
    fetchGameMatchesForCommunityHub(supabase, 250).then(({ data }) => setAllMatches(data))
  }, [])

  useEffect(() => {
    if (!inviteCopied) return
    const id = window.setTimeout(() => setInviteCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [inviteCopied])

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
        if (inviteFromUrl) router.replace('/pools')
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
      if (inviteFromUrl) router.replace('/pools')
      await loadPools(user.id)
    }

    void handleInvite()
  }, [authReady, inviteFromUrl, loadPools, router, user])

  useEffect(() => {
    void loadPoolDetails()
  }, [loadPoolDetails])

  async function copyInviteLink() {
    if (!selectedPool || typeof window === 'undefined') return
    const url = `${window.location.origin}/pools/join/${selectedPool.invite_token}`
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
    } catch {
      setMessage('Could not copy link. Try copying from the address bar after opening the invite page.')
    }
  }

  const createNameValid = createName.trim().length >= 3

  async function onCreatePool() {
    if (!createNameValid) return
    setCreating(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('create_pool', {
        p_name: createName.trim(),
        p_is_public: createPublic,
      })
      const pool = data as PoolRow | null
      if (error) {
        setMessage(error.message)
        return
      }
      if (!pool) {
        setMessage('Could not create pool.')
        return
      }
      setCreateName('')
      setCreatePublic(false)
      await loadPools()
      setSelectedPoolId(pool.id)
      setMessage('Pool created. Share the invite link with friends.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create pool.')
    } finally {
      setCreating(false)
    }
  }

  async function onSearchPools() {
    setSearching(true)
    const { rows, error } = await searchPublicPools(supabase, searchQuery)
    setSearching(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setPublicRows(rows)
  }

  async function onRequestJoin(poolId: string, inviteToken?: string) {
    const { error } = await requestJoinPool(supabase, poolId, inviteToken)
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
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <p className="text-sm text-gray-500">Loading pools…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Pools</h1>
        <p className="mt-3 text-sm text-gray-600">Log in to create pools, request to join, and track pool leaderboards.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Pools</h1>
      <p className="mt-2 text-sm text-gray-600">
        Private prediction groups with admin approvals, weekly match selection, and pool-only leaderboards.
      </p>
      <div className="mt-4">
        <Link
          href="/pools/manage"
          className="inline-flex rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          Manage pools
        </Link>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">{message}</p> : null}

      {myPools.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-700">Create or join a pool.</p>
          <Link
            href="/pools/manage"
            className="mt-4 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Create or join a pool
          </Link>
        </section>
      ) : null}

      {showManagement ? (
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">Create pool</h2>
          <div className="mt-3">
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Pool name (3–80 characters)"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
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
                disabled={creating || !createNameValid}
                className="shrink-0 self-end rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50 sm:self-auto"
              >
                {creating ? 'Creating...' : 'Create pool'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">Search public pools</h2>
          <div className="mt-3 flex gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
            <button
              type="button"
              onClick={() => void onSearchPools()}
              disabled={searching}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-800"
            >
              Search
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {publicRows.map((r) => {
              const id = String(r.id ?? '')
              const name = String(r.name ?? 'Pool')
              const memberCount = Number(r.member_count ?? 0)
              return (
                <div key={id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{name}</p>
                    <p className="text-xs text-gray-500">{memberCount} members</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRequestJoin(id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800"
                  >
                    Request join
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>
      ) : null}

      <section className="mt-8 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">My pools</h2>
          <div className="mt-3 space-y-2">
            {myPools.length === 0 ? (
              <p>No pools yet.</p>
            ) : (
              myPools.map((pool) => (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => setSelectedPoolId(pool.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    pool.id === selectedPoolId ? 'border-gray-900 bg-gray-100' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{pool.name}</span>
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

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          {!selectedPool ? (
            <p className="text-sm text-gray-500">Select a pool to view details.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-gray-900">{selectedPool.name}</h2>
                    {selectedPool.admin_user_id === user.id ? (
                      <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        Admin
                      </span>
                    ) : null}
                  </div>
                  {isAdmin ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {showManagement ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void copyInviteLink()}
                            className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                          >
                            Copy invite link
                          </button>
                          {inviteCopied ? (
                            <span className="text-sm font-medium text-emerald-800">Invite link copied.</span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <p className="text-xs font-semibold text-gray-600">{isAdmin ? 'You are admin' : 'Member view'}</p>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Included groups</h3>
                {selectedPoolGroups.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">Prestige Pool fallback applies (no groups explicitly selected).</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedPoolGroups.map((g) => (
                      <span key={g.id} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700">
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Leaderboard</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ['total', 'Total points'],
                    ['margin_total', 'Margin error'],
                    ['margin_avg', 'Average margin error'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLeaderMetric(id as LeaderMetric)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        leaderMetric === id ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {leaderLoading ? (
                  <p className="mt-3 text-sm text-gray-500">Loading leaderboard…</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {sortedLeaderRows.map((r, i) => {
                      const joinedAt = membershipByPool.get(selectedPool.id)?.joined_at
                      const afterJoin = joinedAt ? new Date(r.joined_at) >= new Date(joinedAt) : true
                      const metricValue =
                        leaderMetric === 'total'
                          ? `${r.total_points.toFixed(1)} pts`
                          : leaderMetric === 'margin_total'
                            ? `${r.total_margin_difference} err`
                            : `${r.average_margin_difference == null ? '—' : r.average_margin_difference.toFixed(2)} avg err`
                      return (
                        <div key={r.user_id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-8 text-xs font-bold text-gray-500">#{i + 1}</span>
                            <LetterAvatar
                              letter={r.avatar_letter}
                              colour={r.avatar_colour}
                              avatarUrl={r.avatar_url}
                              displayName={r.display_name}
                              name={r.display_name}
                              size={28}
                              className="ring-1 ring-gray-200"
                            />
                            <p className="truncate text-sm font-semibold text-gray-900">{r.display_name}</p>
                            {!afterJoin ? <span className="text-[10px] text-gray-500">Late joiner</span> : null}
                          </div>
                          <p className="text-xs font-semibold text-gray-800">{metricValue}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Weekly matches</h3>
                <p className="mt-1 text-xs text-gray-500">Current week pool matches (featured fallback applies when none selected).</p>
                {effectiveMatches.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">No pool matches selected yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {effectiveMatches.map((m) => (
                      <div key={m.id} className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800">
                        {teamVs(m)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                            <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                              <p className="text-sm text-gray-800">
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
                      <div key={r.user_id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                        <p className="text-sm text-gray-800">{r.display_name}</p>
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

export default function PoolsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-12 text-slate-500">Loading pools...</div>}>
      <PoolsPageContent />
    </Suspense>
  )
}
