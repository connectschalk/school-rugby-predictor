'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Settings, Info } from 'lucide-react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import HowItWorksModal from '@/components/HowItWorksModal'
import SoccerScoringRulesBody from '@/components/competitions/SoccerScoringRulesBody'
import SoccerScoringBreakdownModal, {
  type SoccerScoringBreakdownTarget,
} from '@/components/competitions/SoccerScoringBreakdownModal'
import SoccerLeaderboardPlayerButton from '@/components/competitions/SoccerLeaderboardPlayerButton'
import DeletePoolConfirmModal from '@/components/pools/DeletePoolConfirmModal'
import PoolInformationModal from '@/components/pools/PoolInformationModal'
import PoolLogo from '@/components/pools/PoolLogo'
import PoolLogoUploadSection from '@/components/pools/PoolLogoUploadSection'
import PoolVisibilitySetting from '@/components/pools/PoolVisibilitySetting'
import PoolInviteJoinModeSetting from '@/components/pools/PoolInviteJoinModeSetting'
import PoolPicksSection from '@/components/pools/PoolPicksSection'
import PoolPredictTabSection from '@/components/pools/PoolPredictTabSection'
import { buildLoginHref } from '@/lib/auth-return-path'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import {
  canUserCreatePoolInCompetition,
  countUserAdminPoolsForCompetition,
  createPool,
  declinePoolJoinRequest,
  deletePool,
  approvePoolJoinRequest,
  fetchAdminPoolPendingJoinCounts,
  fetchEffectivePoolMatches,
  fetchMyPendingPoolJoinRequests,
  fetchPoolGroups,
  fetchPoolTeams,
  fetchMyPools,
  fetchPoolJoinRequests,
  fetchPoolLeaderboard,
  isPoolJoinRequestAlreadySentError,
  removePoolMember,
  requestJoinPool,
  searchPublicPools,
  updatePoolVisibility,
  updatePoolInviteJoinMode,
  type PoolInviteJoinMode,
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
import { buildPoolSharePayload, sharePoolInvite } from '@/lib/pool-share'
import {
  formatPoolJoinCodeDisplay,
  validatePoolJoinCodeInput,
} from '@/lib/pool-join-code'
import type { CompetitionMode, CompetitionScoringMode } from '@/lib/competitions'
import { isSoccerExactScoreMode, SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
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

function formatRequestedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const PENDING_POOL_INVITE_KEY = 'pending_pool_invite_id'

export type PoolsHubPanelProps = {
  competitionId: string
  competitionSlug: string
  competitionName?: string
  competitionMode: CompetitionMode
  scoringMode?: CompetitionScoringMode
}

function PoolsPageContent({
  competitionId,
  competitionSlug,
  competitionName,
  competitionMode,
  scoringMode = 'rugby_margin',
}: PoolsHubPanelProps) {
  const soccerMode = isSoccerExactScoreMode(scoringMode)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [message, setMessage] = useState('')
  const userId = user?.id ?? null

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
  const [pendingRequestPoolIds, setPendingRequestPoolIds] = useState<Set<string>>(() => new Set())
  const [adminPendingCounts, setAdminPendingCounts] = useState<Map<string, number>>(() => new Map())
  const [sentRequestPoolIds, setSentRequestPoolIds] = useState<Set<string>>(() => new Set())

  const [allMatches, setAllMatches] = useState<GameMatch[]>([])
  const [effectiveMatchIds, setEffectiveMatchIds] = useState<string[]>([])
  const [selectedPoolGroups, setSelectedPoolGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [savingMatches, setSavingMatches] = useState(false)

  const [inviteCopied, setInviteCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const loadPoolsRef = useRef<(explicitUserId?: string) => Promise<void>>(async () => {})
  const inviteHandledRef = useRef<string | null>(null)

  const [leaderRows, setLeaderRows] = useState<PoolLeaderboardRow[]>([])
  const [leaderLoading, setLeaderLoading] = useState(false)
  const [poolTeamsRows, setPoolTeamsRows] = useState<PoolTeamRow[]>([])
  const [poolDetailTab, setPoolDetailTab] = useState<PoolDetailTab>('leaderboard')
  const [managePoolModalOpen, setManagePoolModalOpen] = useState(false)
  const [poolInfoModalOpen, setPoolInfoModalOpen] = useState(false)
  const [scoringRulesOpen, setScoringRulesOpen] = useState(false)
  const [breakdownTarget, setBreakdownTarget] = useState<SoccerScoringBreakdownTarget | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingPool, setDeletingPool] = useState(false)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [savingInviteJoinMode, setSavingInviteJoinMode] = useState(false)
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [activePoolView, setActivePoolView] = useState<'my-pools' | 'join' | 'create'>('my-pools')
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
  const canManagePool = Boolean(user && selectedPool && (isAdmin || isUserAdmin))
  const canDeletePool = Boolean(user && selectedPool && (isAdmin || isUserAdmin))
  const selectedPoolPendingCount = selectedPoolId ? adminPendingCounts.get(selectedPoolId) ?? 0 : 0
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

  const loadPendingJoinState = useCallback(async (uid: string | null) => {
    if (!uid) {
      setPendingRequestPoolIds(new Set())
      setAdminPendingCounts(new Map())
      return
    }
    const [mineRes, adminRes] = await Promise.all([
      fetchMyPendingPoolJoinRequests(supabase, competitionId),
      fetchAdminPoolPendingJoinCounts(supabase, competitionId),
    ])
    if (!mineRes.error) {
      setPendingRequestPoolIds(new Set(mineRes.rows.map((r) => r.pool_id)))
    }
    if (!adminRes.error) {
      setAdminPendingCounts(adminRes.counts)
    }
  }, [competitionId])

  const loadPools = useCallback(async (explicitUserId?: string) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const activeUserId = explicitUserId ?? sessionData.session?.user?.id

    if (!activeUserId) return

    const result = await fetchMyPools(supabase, activeUserId, competitionId)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setMyPools((prev) => {
      if (
        prev.length === result.pools.length &&
        prev.every((pool, index) => pool.id === result.pools[index]?.id)
      ) {
        return prev
      }
      return result.pools
    })
    setMyMemberships(result.memberships)
    await loadPendingJoinState(activeUserId)
  }, [competitionId, loadPendingJoinState])

  const handlePoolLogoUpdated = useCallback((updated: PoolRow) => {
    setMyPools((prev) => prev.map((pool) => (pool.id === updated.id ? { ...pool, ...updated } : pool)))
  }, [])

  loadPoolsRef.current = loadPools

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
    else setMessage(reqRes.error.message)
    if (!effRes.error) {
      const nextMatchIds = effRes.matchIds
      setEffectiveMatchIds((prev) => {
        if (
          prev.length === nextMatchIds.length &&
          prev.every((id, index) => id === nextMatchIds[index])
        ) {
          return prev
        }
        return nextMatchIds
      })
      setSelectedMatchIds(nextMatchIds)
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
    }, 5000)

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) console.error('Pools getSession error:', error)
        if (cancelled) return
        setUser(data.session?.user ?? null)
      } catch (err) {
        console.error('Pools getSession failed:', err)
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }
    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      setAuthReady(true)
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setMyPools([])
        setMyMemberships([])
        setSelectedPoolId(null)
        inviteHandledRef.current = null
        return
      }
      if (!session?.user) return
      setUser((prev) => (prev?.id === session.user.id ? prev : session.user))
    })
    return () => {
      cancelled = true
      window.clearTimeout(fallbackId)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setMyPools([])
      setMyMemberships([])
      return
    }
    void loadPools(userId)
  }, [userId, competitionId, loadPools])

  useEffect(() => {
    if (myPools.length === 0) return
    setSelectedPoolId((prev) => {
      if (prev && myPools.some((pool) => pool.id === prev)) return prev
      return myPools[0]?.id ?? null
    })
  }, [myPools])

  useEffect(() => {
    fetchGameMatchesForCommunityHub(supabase, 250, competitionId).then(({ data }) => setAllMatches(data))
  }, [competitionId])

  useEffect(() => {
    if (!userId) {
      setIsUserAdmin(false)
      return
    }
    let cancelled = false
    void fetchUserIsAdmin(supabase, userId).then(({ isAdmin }) => {
      if (!cancelled) setIsUserAdmin(isAdmin)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

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
    if (!shareCopied) return
    const id = window.setTimeout(() => setShareCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [shareCopied])

  useEffect(() => {
    if (!authReady) return
    const pendingFromStorage =
      typeof window === 'undefined' ? '' : (window.localStorage.getItem(PENDING_POOL_INVITE_KEY) ?? '').trim()
    const invitePoolId = inviteFromUrl || pendingFromStorage
    if (!invitePoolId) return
    if (inviteHandledRef.current === invitePoolId) return
    inviteHandledRef.current = invitePoolId

    const stripInviteFromUrl = () => {
      if (!inviteFromUrl) return
      const query = searchParams.toString()
      const currentPath = query ? `${pathname}?${query}` : pathname
      if (currentPath !== poolsBase) {
        router.replace(poolsBase)
      }
    }

    const handleInvite = async () => {
      if (!userId) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PENDING_POOL_INVITE_KEY, invitePoolId)
        }
        const query = searchParams.toString()
        const returnPath = query ? `${pathname}?${query}` : pathname
        const loginHref = buildLoginHref(returnPath)
        if (!pathname.startsWith('/login')) {
          router.replace(loginHref)
        }
        return
      }

      const { data: memberRow, error: memberErr } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('pool_id', invitePoolId)
        .eq('user_id', userId)
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
        stripInviteFromUrl()
        return
      }

      const { data: poolRow } = await supabase
        .from('pools')
        .select('name')
        .eq('id', invitePoolId)
        .maybeSingle()
      const poolName = String((poolRow as { name?: string } | null)?.name ?? 'pool')

      const { error, alreadySent } = await requestJoinPool(supabase, invitePoolId)
      if (error) {
        setMessage(
          alreadySent || isPoolJoinRequestAlreadySentError(error)
            ? 'Request already sent.'
            : error.message
        )
        return
      }
      setMessage(`Request sent to pool admin for ${poolName}.`)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(PENDING_POOL_INVITE_KEY)
      }
      stripInviteFromUrl()
      await loadPoolsRef.current(userId)
    }

    void handleInvite()
  }, [authReady, inviteFromUrl, pathname, poolsBase, router, searchParams, userId])

  useEffect(() => {
    void loadPoolDetails()
  }, [loadPoolDetails])

  useEffect(() => {
    setPoolDetailTab('leaderboard')
    setManagePoolModalOpen(false)
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

  async function shareInviteLink() {
    if (!selectedPool || typeof window === 'undefined' || !user) return
    const url = `${window.location.origin}${buildPoolJoinPath(selectedPool.invite_token, user.id, competitionSlug)}`
    const payload = buildPoolSharePayload(
      selectedPool.name,
      competitionName ?? 'your competition',
      url
    )
    const result = await sharePoolInvite(payload)
    if (result === 'shared' || result === 'copied') {
      setShareCopied(true)
      return
    }
    if (result === 'failed') {
      setMessage('Could not share invite. Try copying the link instead.')
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
      setActivePoolView('my-pools')
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
    const { error, alreadySent } = await requestJoinPool(supabase, poolId, {
      joinCode: joinCode || undefined,
    })
    if (error) {
      if (alreadySent || isPoolJoinRequestAlreadySentError(error)) {
        setMessage('Request already sent.')
        setPendingRequestPoolIds((prev) => new Set(prev).add(poolId))
        setSentRequestPoolIds((prev) => new Set(prev).add(poolId))
      } else {
        setMessage(error.message)
      }
      return
    }
    setMessage('Request sent to pool admin.')
    setPendingRequestPoolIds((prev) => new Set(prev).add(poolId))
    setSentRequestPoolIds((prev) => new Set(prev).add(poolId))
    if (userId) await loadPools(userId)
  }

  async function onReview(requestId: string, action: 'approve' | 'decline') {
    const { error } =
      action === 'approve'
        ? await approvePoolJoinRequest(supabase, requestId)
        : await declinePoolJoinRequest(supabase, requestId)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage(action === 'approve' ? 'Member approved.' : 'Join request declined.')
    await loadPoolDetails()
    await loadPendingJoinState(userId)
    if (userId) await loadPools(userId)
  }

  async function onRemoveMember(memberUserId: string) {
    if (!selectedPoolId) return
    const { error } = await removePoolMember(supabase, selectedPoolId, memberUserId)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Member removed from pool.')
    await loadPoolDetails()
  }

  async function onTogglePoolVisibility(isPublic: boolean) {
    if (!selectedPoolId || !canManagePool) return
    setSavingVisibility(true)
    setMessage('')
    try {
      const { pool, error } = await updatePoolVisibility(supabase, selectedPoolId, isPublic)
      if (error || !pool) {
        setMessage(error?.message ?? 'Could not update pool visibility.')
        return
      }
      handlePoolLogoUpdated(pool)
      setMessage(pool.is_public ? 'Pool is now public.' : 'Pool is now private.')
    } finally {
      setSavingVisibility(false)
    }
  }

  async function onChangeInviteJoinMode(mode: PoolInviteJoinMode) {
    if (!selectedPoolId || !canManagePool) return
    setSavingInviteJoinMode(true)
    setMessage('')
    try {
      const { pool, error } = await updatePoolInviteJoinMode(supabase, selectedPoolId, mode)
      if (error || !pool) {
        setMessage(error?.message ?? 'Could not update invite link access.')
        return
      }
      handlePoolLogoUpdated(pool)
      setMessage(
        pool.invite_join_mode === 'auto'
          ? 'Invite link users can now join automatically.'
          : 'Invite link users must request to join.'
      )
    } finally {
      setSavingInviteJoinMode(false)
    }
  }

  async function onConfirmDeletePool() {
    if (!selectedPool || !canDeletePool) return
    setDeletingPool(true)
    const poolId = selectedPool.id
    const { error } = await deletePool(supabase, poolId)
    setDeletingPool(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setManagePoolModalOpen(false)
    setDeleteConfirmOpen(false)
    setSelectedPoolId(null)
    if (userId) await loadPools(userId)
    router.push(poolsBase)
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

  if (!authReady) {
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
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setActivePoolView('my-pools')}
          className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${
            activePoolView === 'my-pools'
              ? 'border-gray-900 bg-gray-900 text-white hover:bg-black'
              : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
          }`}
        >
          My pools
        </button>
        <button
          type="button"
          onClick={() => setActivePoolView('join')}
          className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${
            activePoolView === 'join'
              ? 'border-gray-900 bg-gray-900 text-white hover:bg-black'
              : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
          }`}
        >
          Join pool
        </button>
        {showManagement ? (
          <button
            type="button"
            onClick={() => setActivePoolView('create')}
            className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition sm:w-auto ${
              activePoolView === 'create'
                ? 'border-gray-900 bg-gray-900 text-white hover:bg-black'
                : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Create pool
          </button>
        ) : (
          <Link
            href={createPoolPath}
            className="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 sm:w-auto"
          >
            Create pool
          </Link>
        )}
      </div>
      {message ? (
        <p className="mt-4 min-w-0 break-words rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
          {message}
        </p>
      ) : null}

      {activePoolView === 'join' ? (
        <section className="mt-6 w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
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
            {publicRows.map((r) => {
              const alreadyRequested =
                pendingRequestPoolIds.has(r.id) ||
                sentRequestPoolIds.has(r.id) ||
                membershipByPool.has(r.id)
              const isMember = membershipByPool.has(r.id)
              return (
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
                  {isMember ? (
                    <span className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                      Member
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onRequestJoin(r.id, r.join_code)}
                      disabled={alreadyRequested}
                      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      {alreadyRequested ? 'Request sent' : 'Request join'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {showManagement && activePoolView === 'create' ? (
        <section className="mt-6 w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
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
        </section>
      ) : null}

      <section className="mt-8 grid min-w-0 max-w-full gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-black text-gray-900">My pools</h2>
          <div className="mt-3 space-y-2">
            {myPools.length === 0 ? (
              <p className="min-w-0 break-words">No pools yet.</p>
            ) : (
              myPools.map((pool) => {
                const pendingForPool = adminPendingCounts.get(pool.id) ?? 0
                return (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => {
                    if (pool.id !== selectedPoolId) setSelectedPoolId(pool.id)
                  }}
                  className={`w-full max-w-full min-w-0 rounded-xl border px-3 py-2 text-left ${
                    pool.id === selectedPoolId ? 'border-gray-900 bg-gray-100' : 'border-gray-200'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <PoolLogo logoUrl={pool.logo_url} name={pool.name} size="sm" />
                    <span className="min-w-0 truncate font-medium">{pool.name}</span>
                    {pool.admin_user_id === user.id ? (
                      <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        Admin
                      </span>
                    ) : null}
                    {pendingForPool > 0 && (pool.admin_user_id === user.id || isUserAdmin) ? (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {pendingForPool}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{pool.is_public ? 'Public' : 'Private'} pool</p>
                </button>
                )
              })
            )}
          </div>
        </aside>

        <div className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
          {!selectedPool ? (
            <p className="min-w-0 break-words text-sm text-gray-500">Select a pool to view details.</p>
          ) : (
            <>
              <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <PoolLogo logoUrl={selectedPool.logo_url} name={selectedPool.name} size="md" />
                  <h2 className="min-w-0 break-words text-lg font-black text-gray-900">{selectedPool.name}</h2>
                  {selectedPool.admin_user_id === user.id ? (
                    <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                      Admin
                    </span>
                  ) : null}
                  {canManagePool && selectedPoolPendingCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800">
                      {selectedPoolPendingCount} join request{selectedPoolPendingCount === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPoolInfoModalOpen(true)
                      void loadPoolDetails()
                    }}
                    aria-expanded={poolInfoModalOpen}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  >
                    <Info className="size-4 shrink-0 text-gray-600" aria-hidden />
                    Info
                  </button>
                  {canManagePool ? (
                  <button
                    type="button"
                    onClick={() => {
                      setManagePoolModalOpen(true)
                      void loadPoolDetails()
                    }}
                    aria-expanded={managePoolModalOpen}
                    aria-controls="manage-pool-dialog"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  >
                    <Settings className="size-4 shrink-0 text-gray-600" aria-hidden />
                    Manage Pool
                    {selectedPoolPendingCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {selectedPoolPendingCount}
                      </span>
                    ) : null}
                  </button>
                  ) : null}
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
              </div>

              {poolDetailTab === 'leaderboard' ? (
                <>
                  <div className="mt-6 min-w-0 max-w-full">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Leaderboard</h3>
                      {soccerMode ? (
                        <button
                          type="button"
                          onClick={() => setScoringRulesOpen(true)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800"
                          aria-label="View scoring rules"
                        >
                          <Info className="h-3 w-3" aria-hidden />
                        </button>
                      ) : null}
                    </div>
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
                                      {soccerMode ? (
                                        <SoccerLeaderboardPlayerButton
                                          name={r.display_name}
                                          displayName={r.display_name}
                                          avatarUrl={r.avatar_url}
                                          avatarLetter={r.avatar_letter}
                                          avatarColour={r.avatar_colour}
                                          size={28}
                                          onOpen={() =>
                                            setBreakdownTarget({
                                              userId: r.user_id,
                                              displayName: r.display_name?.trim() || 'Player',
                                              poolId: selectedPool.id,
                                              poolJoinedAt: r.joined_at,
                                            })
                                          }
                                        />
                                      ) : (
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
                                          <span
                                            className="min-w-0 truncate font-semibold text-gray-900"
                                            title={r.display_name}
                                          >
                                            {r.display_name}
                                          </span>
                                        </div>
                                      )}
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
                </>
              ) : poolDetailTab === 'picks' ? (
                isPoolMember && user ? (
                  <PoolPicksSection
                    supabase={supabase}
                    poolId={selectedPool.id}
                    userId={user.id}
                    isMember={isPoolMember}
                    competitionSlug={competitionSlug}
                    scoringMode={scoringMode}
                  />
                ) : (
                  <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Pool picks are only visible to pool members.
                  </p>
                )
              ) : poolDetailTab === 'predict' ? (
                isPoolMember && user ? (
                  <PoolPredictTabSection
                    effectiveMatchIds={effectiveMatchIds}
                    user={user}
                    competitionSlug={competitionSlug}
                    scoringMode={scoringMode}
                  />
                ) : (
                  <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Predictions for this pool are available to members only.
                  </p>
                )
              ) : null}

              {poolInfoModalOpen && selectedPool ? (
                <PoolInformationModal
                  open={poolInfoModalOpen}
                  onClose={() => setPoolInfoModalOpen(false)}
                  pool={selectedPool}
                  groups={selectedPoolGroups}
                  teams={poolTeamsRows}
                  matches={effectiveMatches}
                />
              ) : null}

              {managePoolModalOpen && selectedPool && canManagePool ? (
                <div
                  className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
                  role="presentation"
                  onClick={() => setManagePoolModalOpen(false)}
                >
                  <div
                    id="manage-pool-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="manage-pool-dialog-title"
                    className="max-h-[min(85vh,640px)] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 sm:px-5">
                      <h2 id="manage-pool-dialog-title" className="min-w-0 pr-2 text-lg font-black text-gray-900">
                        Manage Pool
                      </h2>
                      <button
                        type="button"
                        onClick={() => setManagePoolModalOpen(false)}
                        className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    <div className="space-y-6 px-4 py-4 sm:px-5 sm:py-5">
                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Pool name</h3>
                        <div className="mt-2 flex items-center gap-3">
                          <PoolLogo logoUrl={selectedPool.logo_url} name={selectedPool.name} size="md" />
                          <p className="text-base font-semibold text-gray-900">{selectedPool.name}</p>
                        </div>
                      </section>

                      <PoolLogoUploadSection
                        client={supabase}
                        pool={selectedPool}
                        canManagePool={canManagePool}
                        onPoolUpdated={handlePoolLogoUpdated}
                      />

                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">
                          Pool visibility
                        </h3>
                        <div className="mt-2">
                          <PoolVisibilitySetting
                            isPublic={selectedPool.is_public}
                            saving={savingVisibility}
                            onChange={(next) => void onTogglePoolVisibility(next)}
                          />
                        </div>
                      </section>

                      <section>
                        <PoolInviteJoinModeSetting
                          value={selectedPool.invite_join_mode}
                          saving={savingInviteJoinMode}
                          onChange={(next) => void onChangeInviteJoinMode(next)}
                        />
                      </section>

                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Pool code</h3>
                        {selectedPool.join_code ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm font-bold tracking-wide text-gray-900">
                              {formatPoolJoinCodeDisplay(selectedPool.join_code)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyJoinCode()}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                            >
                              Copy code
                            </button>
                            {codeCopied ? (
                              <span className="text-xs font-medium text-emerald-700">Copied</span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-600">No pool code set.</p>
                        )}
                      </section>

                      <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Invite link</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void shareInviteLink()}
                            className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
                          >
                            Share pool
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyInviteLink()}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                          >
                            Copy invite link
                          </button>
                          {shareCopied ? (
                            <span className="text-xs font-medium text-emerald-700">Share ready</span>
                          ) : null}
                          {inviteCopied ? (
                            <span className="text-xs font-medium text-emerald-700">Link copied</span>
                          ) : null}
                        </div>
                      </section>

                      <section className="border-t border-gray-100 pt-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Members</h3>
                        <div className="mt-3 space-y-2">
                          {leaderRows.map((r) => (
                            <div
                              key={r.user_id}
                              className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                            >
                              <p className="min-w-0 truncate text-sm text-gray-800" title={r.display_name}>
                                {r.display_name}
                              </p>
                              {r.user_id !== selectedPool.admin_user_id ? (
                                <button
                                  type="button"
                                  onClick={() => void onRemoveMember(r.user_id)}
                                  className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="shrink-0 text-xs font-semibold text-gray-500">Admin</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="border-t border-gray-100 pt-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">
                          Pending join requests
                        </h3>
                        {requestsLoading ? (
                          <p className="mt-2 text-sm text-gray-500">Loading requests…</p>
                        ) : joinRequests.length === 0 ? (
                          <p className="mt-2 text-sm text-gray-500">No pending requests.</p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {joinRequests.map((r) => (
                              <li key={r.id} className="rounded-xl border border-gray-200 px-3 py-2.5">
                                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p
                                      className="truncate text-sm font-semibold text-gray-900"
                                      title={requestDisplayName(r, profilesById)}
                                    >
                                      {requestDisplayName(r, profilesById)}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                      Requested {formatRequestedAt(r.requested_at)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void onReview(r.id, 'approve')}
                                      className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void onReview(r.id, 'decline')}
                                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

                      {canDeletePool ? (
                        <section className="border-t border-gray-100 pt-4">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmOpen(true)}
                            className="w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100"
                          >
                            Delete Pool
                          </button>
                        </section>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <DeletePoolConfirmModal
                open={deleteConfirmOpen}
                deleting={deletingPool}
                onCancel={() => {
                  if (!deletingPool) setDeleteConfirmOpen(false)
                }}
                onConfirm={() => void onConfirmDeletePool()}
              />
            </>
          )}
        </div>
      </section>
      {soccerMode ? (
        <HowItWorksModal
          open={scoringRulesOpen}
          onClose={() => setScoringRulesOpen(false)}
          title="How scoring works"
        >
          <SoccerScoringRulesBody />
        </HowItWorksModal>
      ) : null}
      {soccerMode ? (
        <SoccerScoringBreakdownModal
          open={breakdownTarget !== null}
          onClose={() => setBreakdownTarget(null)}
          client={supabase}
          target={breakdownTarget}
          competitionId={competitionId}
          competitionSlug={competitionSlug}
        />
      ) : null}
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
