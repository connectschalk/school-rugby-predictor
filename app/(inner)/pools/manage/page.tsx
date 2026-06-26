'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import DeletePoolConfirmModal from '@/components/pools/DeletePoolConfirmModal'
import PoolLogo from '@/components/pools/PoolLogo'
import PoolCreateScopeModal from '@/components/pools/PoolCreateScopeModal'
import PoolCreateSelectTeamsModal from '@/components/pools/PoolCreateSelectTeamsModal'
import PoolTeamPicker from '@/components/pools/PoolTeamPicker'
import ProvinceLogoMark from '@/components/ProvinceLogoMark'
import CompetitionTeamLogo from '@/components/CompetitionTeamLogo'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import {
  buildPoolPickerAliasLookup,
  dedupeTeamRowsToCanonicalOptions,
  pickTeamsTabDisplayCanonical,
  resolveToPickerCanonical,
  type TeamDbRowForPicker,
} from '@/lib/pool-picker-teams'
import { teamProvinceMatchesFixtureGroup } from '@/lib/province-team-directory'
import { getTeamsForProvince, provinceCodesForFixtureGroupSlug } from '@/lib/teams-sheet-province'
import {
  canUserCreatePoolInCompetition,
  countUserAdminPoolsForCompetition,
  createPool,
  deletePool,
  fetchFixtureGroups,
  fetchMyPools,
  fetchPoolGroups,
  fetchPoolJoinRequests,
  fetchPoolLeaderboard,
  fetchPoolTeams,
  replacePoolTeams,
  type PoolLeaderboardRow,
  previewPoolGroups,
  removePoolMember,
  requestJoinPool,
  approvePoolJoinRequest,
  declinePoolJoinRequest,
  isPoolJoinRequestAlreadySentError,
  searchPublicPools,
  setPoolGroups,
  fetchGameMatchGroupLinksForGroups,
  fetchFixtureGroupTeamsForGroups,
  fetchFixtureGroupAliasesMap,
  fetchFixtureGroupTeamCounts,
  upsertPoolMatches,
  MAX_POOLS_PER_COMPETITION,
  POOL_CREATION_LIMIT_MESSAGE,
  type FixtureGroupRow,
  type PoolGroupsPreview,
  type PoolJoinRequestRow,
  type PoolRow,
  type PoolSearchRow,
  type PoolTeamRow,
} from '@/lib/pools'
import {
  computePoolCreationPreview,
  countPoolCreationMatchesInKickoffWindow,
  mergePoolPreviewSources,
  type PoolPreviewGraph,
  type PoolPreviewMatch,
} from '@/lib/pool-creation-preview'
import { buildPoolJoinPath } from '@/lib/pool-invite-path'
import {
  formatPoolJoinCodeDisplay,
  validatePoolJoinCodeInput,
} from '@/lib/pool-join-code'
import { getCompetitionBySlug, SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { fetchGameMatchesForPoolPreview, type GameMatch } from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'

function teamVs(m: GameMatch) {
  return `${m.home_team} vs ${m.away_team}`
}

const MAX_USER_MEMBERSHIPS = 3
const GROUP_TYPE_ORDER = ['prestige', 'province', 'league', 'festival', 'custom'] as const
const GROUP_TYPE_LABEL: Record<string, string> = {
  prestige: 'Prestige',
  province: 'Province',
  league: 'League',
  festival: 'Festival',
  custom: 'Custom',
}

/** Hidden from pool manage pickers (use WP Premium instead of WP Elite). */
const MANAGE_POOL_HIDDEN_SLUGS = new Set(['interprovincial', 'wp-elite'])
const MANAGE_POOL_EVENT_SLUGS = new Set(['prestige-pool', 'wp-premium'])

function isManagePoolHiddenGroup(g: FixtureGroupRow): boolean {
  return MANAGE_POOL_HIDDEN_SLUGS.has((g.slug ?? '').trim().toLowerCase())
}
export default function ManagePoolsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [publicRows, setPublicRows] = useState<PoolSearchRow[]>([])
  const [joinRequests, setJoinRequests] = useState<PoolJoinRequestRow[]>([])
  const [poolPreviewMatches, setPoolPreviewMatches] = useState<PoolPreviewMatch[]>([])
  const [fixtureAliasMap, setFixtureAliasMap] = useState<Map<string, string[]>>(() => new Map())
  const [teamCountsByGroupId, setTeamCountsByGroupId] = useState<Map<string, number>>(() => new Map())
  const [clientCreatePreview, setClientCreatePreview] = useState<PoolGroupsPreview | null>(null)
  const [clientEditPreview, setClientEditPreview] = useState<PoolGroupsPreview | null>(null)
  const [clientPreviewLoadingCreate, setClientPreviewLoadingCreate] = useState(false)
  const [clientPreviewLoadingEdit, setClientPreviewLoadingEdit] = useState(false)
  const poolPreviewMatchesRef = useRef<PoolPreviewMatch[]>([])
  const fixtureAliasMapRef = useRef<Map<string, string[]>>(new Map())
  type ClientPreviewCacheEntry = { preview: PoolGroupsPreview; graph: PoolPreviewGraph }
  const previewCacheRef = useRef(new Map<string, ClientPreviewCacheEntry>())
  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroupRow[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [createSelectedGroupIds, setCreateSelectedGroupIds] = useState<string[]>([])
  const [leaderRows, setLeaderRows] = useState<PoolLeaderboardRow[]>([])

  const [createName, setCreateName] = useState('')
  const [createJoinCode, setCreateJoinCode] = useState('')
  const [createPublic, setCreatePublic] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [searching, setSearching] = useState(false)
  const [savingMatches, setSavingMatches] = useState(false)
  const [savingGroups, setSavingGroups] = useState(false)
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [deletingPoolId, setDeletingPoolId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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
  const [canonicalTeamNames, setCanonicalTeamNames] = useState<string[]>([])
  const [poolPickerAliasLookup, setPoolPickerAliasLookup] = useState<Map<string, string>>(() => new Map())
  const [createSelectedTeamNames, setCreateSelectedTeamNames] = useState<string[]>([])
  const [editPoolTeamNames, setEditPoolTeamNames] = useState<string[]>([])
  const [poolTeamsRows, setPoolTeamsRows] = useState<PoolTeamRow[]>([])
  const [savingPoolTeams, setSavingPoolTeams] = useState(false)
  const [createClientGraph, setCreateClientGraph] = useState<PoolPreviewGraph | null>(null)
  const [teamsModalOpen, setTeamsModalOpen] = useState(false)
  const [scopeModalOpen, setScopeModalOpen] = useState(false)
  const [schoolsCompetitionId, setSchoolsCompetitionId] = useState<string | null>(null)
  const [scopeGroupTeams, setScopeGroupTeams] = useState<Map<string, string[]>>(() => new Map())

  const selectedPool = useMemo(() => myPools.find((p) => p.id === selectedPoolId) ?? null, [myPools, selectedPoolId])
  const totalMemberships = myPools.length
  const adminSchoolsPoolCount =
    user && schoolsCompetitionId
      ? countUserAdminPoolsForCompetition(myPools, user.id, schoolsCompetitionId, schoolsCompetitionId)
      : 0
  const canCreatePool =
    isUserAdmin ||
    (schoolsCompetitionId != null &&
      canUserCreatePoolInCompetition(myPools, user?.id ?? '', schoolsCompetitionId, {
        isAppAdmin: isUserAdmin,
        schoolsCompetitionId,
      }))
  const canJoinPool = isUserAdmin || totalMemberships < MAX_USER_MEMBERSHIPS
  const hasReachedMembershipLimit = !isUserAdmin && totalMemberships >= MAX_USER_MEMBERSHIPS
  const hasReachedCreateLimit =
    !isUserAdmin &&
    schoolsCompetitionId != null &&
    adminSchoolsPoolCount >= MAX_POOLS_PER_COMPETITION
  const isSelectedPoolAdmin = Boolean(user && selectedPool && selectedPool.admin_user_id === user.id)
  const canManageSelectedPool = Boolean(selectedPool && user && (isSelectedPoolAdmin || isUserAdmin))
  const canDeleteSelectedPool = Boolean(selectedPool && user && (isSelectedPoolAdmin || isUserAdmin))
  const createGroupIds = useMemo(
    () =>
      createSelectedGroupIds.filter((id) => {
        const g = fixtureGroups.find((x) => x.id === id)
        return Boolean(g && !isManagePoolHiddenGroup(g))
      }),
    [createSelectedGroupIds, fixtureGroups]
  )
  const createNameValid = createName.trim().length >= 1
  const createJoinCodeError = createJoinCode.trim()
    ? validatePoolJoinCodeInput(createJoinCode)
    : null
  const createScopeValid =
    createGroupIds.length > 0 || createSelectedTeamNames.some((t) => t.trim().length > 0)
  const visibleFixtureGroups = useMemo(
    () => fixtureGroups.filter((g) => !isManagePoolHiddenGroup(g)),
    [fixtureGroups]
  )

  const managePoolSections = useMemo(() => {
    const normalized = visibleFixtureGroups.map((g) => {
      const t = (g.group_type ?? 'custom').toLowerCase()
      const groupType = GROUP_TYPE_ORDER.includes(t as (typeof GROUP_TYPE_ORDER)[number]) ? t : 'custom'
      return { ...g, group_type: groupType }
    })
    const provinces = normalized
      .filter((g) => g.group_type === 'province')
      .filter((g) => (g.slug ?? '').trim().toLowerCase() !== 'noordvaal')
      // NC temporarily hidden until sufficient team coverage
      .filter((g) => (g.slug ?? '').trim().toLowerCase() !== 'northern-cape')
      .sort((a, b) => a.name.localeCompare(b.name))
    const events = normalized
      .filter((g) => MANAGE_POOL_EVENT_SLUGS.has((g.slug ?? '').trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
    const other = normalized.filter((g) => {
      const slug = (g.slug ?? '').trim().toLowerCase()
      if (MANAGE_POOL_EVENT_SLUGS.has(slug)) return false
      if (g.group_type === 'province') return false
      return true
    })
    const groupedOther = GROUP_TYPE_ORDER.map((type) => ({
      type,
      label: GROUP_TYPE_LABEL[type],
      items: other
        .filter((g) => g.group_type === type)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.items.length > 0)
    return { provinces, events, groupedOther }
  }, [visibleFixtureGroups])

  const eventsAndLeaguesFlat = useMemo(
    () => [...managePoolSections.events, ...managePoolSections.groupedOther.flatMap((g) => g.items)],
    [managePoolSections]
  )

  const scopeFixtureGroupIdsKey = useMemo(
    () =>
      [
        ...managePoolSections.provinces.map((p) => p.id),
        ...managePoolSections.events.map((e) => e.id),
        ...managePoolSections.groupedOther.flatMap((g) => g.items.map((i) => i.id)),
      ]
        .sort()
        .join('|'),
    [managePoolSections]
  )

  const createSummaryProvinces = useMemo(
    () => managePoolSections.provinces.filter((p) => createGroupIds.includes(p.id)),
    [managePoolSections, createGroupIds]
  )
  const createSummaryEvents = useMemo(
    () => eventsAndLeaguesFlat.filter((g) => createGroupIds.includes(g.id)),
    [eventsAndLeaguesFlat, createGroupIds]
  )

  useEffect(() => {
    void getCompetitionBySlug(supabase, SCHOOLS_COMPETITION_SLUG).then(({ competition }) => {
      setSchoolsCompetitionId(competition?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!scopeModalOpen) return
    const ids = scopeFixtureGroupIdsKey.split('|').filter(Boolean)
    if (ids.length === 0) {
      setScopeGroupTeams(new Map())
      return
    }
    let cancelled = false
    void (async () => {
      const [{ coreTeamsByGroupId }, teamsRes] = await Promise.all([
        fetchFixtureGroupTeamsForGroups(supabase, ids),
        supabase.from('teams').select('id, name, canonical_name, province'),
      ])
      if (cancelled) return
      const teamRows = (teamsRes.data ?? []) as TeamDbRowForPicker[]
      const groupById = new Map(fixtureGroups.map((g) => [g.id, g]))
      const m = new Map<string, string[]>()
      for (const gid of ids) {
        const g = groupById.get(gid)
        if (!g) continue
        const merged = new Set<string>()
        for (const t of coreTeamsByGroupId.get(gid) ?? []) {
          const trimmed = t.trim()
          if (trimmed) merged.add(trimmed)
        }
        const gt = (g.group_type ?? '').toLowerCase()
        // Teams Google Sheet (`teams.province`) is the master; prefer normalized codes over fixture_group_teams alone.
        if (gt === 'province') {
          const codes = provinceCodesForFixtureGroupSlug(g.slug ?? '')
          if (codes.length > 0) {
            for (const code of codes) {
              for (const name of getTeamsForProvince(code, teamRows, pickTeamsTabDisplayCanonical)) {
                merged.add(name)
              }
            }
          } else {
            for (const row of teamRows) {
              const display = pickTeamsTabDisplayCanonical(row)
              if (!display) continue
              if (teamProvinceMatchesFixtureGroup(row.province, g.slug, g.name)) merged.add(display)
            }
          }
        }
        const names = [...merged]
          .map((t) => resolveToPickerCanonical(t, canonicalTeamNames) ?? t.trim())
          .filter(Boolean)
        m.set(gid, [...new Set(names)].sort((a, b) => a.localeCompare(b)))
      }
      setScopeGroupTeams(m)
    })()
    return () => {
      cancelled = true
    }
  }, [scopeModalOpen, scopeFixtureGroupIdsKey, canonicalTeamNames, fixtureGroups])

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
    const [reqRes, poolGroupsRes, leaderRes, poolTeamsRes] = await Promise.all([
      fetchPoolJoinRequests(supabase, selectedPoolId),
      fetchPoolGroups(supabase, selectedPoolId),
      fetchPoolLeaderboard(supabase, selectedPoolId),
      fetchPoolTeams(supabase, selectedPoolId),
    ])
    if (!reqRes.error) setJoinRequests(reqRes.rows)
    if (!poolGroupsRes.error) setSelectedGroupIds(poolGroupsRes.rows.map((g) => g.id))
    if (!leaderRes.error) setLeaderRows(leaderRes.rows)
    if (!poolTeamsRes.error) {
      setPoolTeamsRows(poolTeamsRes.rows)
      setEditPoolTeamNames(poolTeamsRes.rows.map((r) => r.team_name))
    } else {
      setPoolTeamsRows([])
      setEditPoolTeamNames([])
    }
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
    if (fixtureGroups.length === 0) return
    const hiddenIds = new Set(
      fixtureGroups.filter((g) => isManagePoolHiddenGroup(g)).map((g) => g.id)
    )
    if (hiddenIds.size === 0) return
    setCreateSelectedGroupIds((prev) => prev.filter((id) => !hiddenIds.has(id)))
    setSelectedGroupIds((prev) => prev.filter((id) => !hiddenIds.has(id)))
  }, [fixtureGroups])

  useEffect(() => {
    setSelectedPoolId((prev) => prev ?? myPools[0]?.id ?? null)
  }, [myPools])

  useEffect(() => {
    fetchFixtureGroups(supabase).then(({ rows, error }) => {
      setFixtureGroups(rows)
      if (error) {
        setMessage(`Could not load fixture groups: ${error.message}`)
      }
    })
    void fetchFixtureGroupAliasesMap(supabase).then(({ map, error }) => {
      if (error) setMessage((prev) => prev || `Fixture aliases: ${error.message}`)
      else setFixtureAliasMap(map)
    })
    void fetchFixtureGroupTeamCounts(supabase).then(({ counts, error }) => {
      if (!error) setTeamCountsByGroupId(counts)
    })
    void (async () => {
      const aliasRes = await supabase.from('team_aliases').select('*')
      const aliases = (aliasRes.data as Record<string, unknown>[] | null) ?? []

      let teamRows: TeamDbRowForPicker[] = []
      const withCanon = await supabase.from('teams').select('id, name, canonical_name, province')
      if (!withCanon.error && withCanon.data) {
        teamRows = (withCanon.data as TeamDbRowForPicker[] | null) ?? []
      } else {
        const legacy = await supabase.from('teams').select('id, name')
        if (legacy.error) {
          setMessage((prev) => prev || `Could not load teams: ${legacy.error.message}`)
        } else {
          teamRows = (legacy.data as TeamDbRowForPicker[] | null) ?? []
        }
      }

      const canonicals = dedupeTeamRowsToCanonicalOptions(teamRows)
      setPoolPickerAliasLookup(buildPoolPickerAliasLookup(aliases, teamRows, canonicals))
      setCanonicalTeamNames(canonicals)
    })()
  }, [])

  useEffect(() => {
    if (!schoolsCompetitionId) return
    void fetchGameMatchesForPoolPreview(supabase, 1200, schoolsCompetitionId).then(({ data, error }) => {
      if (error) setMessage(`Could not load fixtures for preview: ${error.message}`)
      setPoolPreviewMatches((data as PoolPreviewMatch[]) ?? [])
    })
  }, [schoolsCompetitionId])

  useEffect(() => {
    poolPreviewMatchesRef.current = poolPreviewMatches
  }, [poolPreviewMatches])

  useEffect(() => {
    fixtureAliasMapRef.current = fixtureAliasMap
  }, [fixtureAliasMap])

  useEffect(() => {
    if (!inviteCopied) return
    const id = window.setTimeout(() => setInviteCopied(false), 4000)
    return () => window.clearTimeout(id)
  }, [inviteCopied])

  useEffect(() => {
    void loadPoolDetails()
  }, [loadPoolDetails])

  useEffect(() => {
    if (canonicalTeamNames.length === 0) return
    setEditPoolTeamNames((prev) => {
      const next = [
        ...new Set(
          prev
            .map((t) => resolveToPickerCanonical(t, canonicalTeamNames) ?? t.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [canonicalTeamNames, poolTeamsRows])

  useEffect(() => {
    const ids = [...new Set(createGroupIds)]
    if (ids.length === 0) {
      setCreatePreview(null)
      return
    }
    setCreatePreviewLoading(true)
    previewPoolGroups(supabase, ids, schoolsCompetitionId ?? undefined).then(({ preview, error }) => {
      if (error) {
        setMessage(error.message)
        setCreatePreview(null)
      } else {
        setCreatePreview(preview)
      }
      setCreatePreviewLoading(false)
    })
  }, [createGroupIds, schoolsCompetitionId])

  const createClientPreviewKey = useMemo(
    () =>
      `c|${[...createGroupIds].sort().join('|')}__${[...createSelectedTeamNames].sort().join('›')}`,
    [createGroupIds, createSelectedTeamNames]
  )

  useEffect(() => {
    if (createGroupIds.length === 0 && createSelectedTeamNames.length === 0) {
      setClientCreatePreview(null)
      setCreateClientGraph(null)
      setClientPreviewLoadingCreate(false)
      return
    }
    const key = createClientPreviewKey
    const cached = previewCacheRef.current.get(key)
    if (cached) {
      setClientCreatePreview(cached.preview)
      setCreateClientGraph(cached.graph)
      setClientPreviewLoadingCreate(false)
      return
    }
    setClientPreviewLoadingCreate(true)
    const t = window.setTimeout(async () => {
      if (createGroupIds.length === 0) {
        const graph: PoolPreviewGraph = {
          links: [],
          aliasesByGroupId: fixtureAliasMapRef.current,
          coreTeamsByGroupId: new Map(),
        }
        const prev = computePoolCreationPreview(
          [],
          fixtureGroups,
          poolPreviewMatchesRef.current,
          graph,
          createSelectedTeamNames
        )
        previewCacheRef.current.set(key, { preview: prev, graph })
        setClientCreatePreview(prev)
        setCreateClientGraph(graph)
        setClientPreviewLoadingCreate(false)
        return
      }

      const [linkRes, coreRes] = await Promise.all([
        fetchGameMatchGroupLinksForGroups(supabase, createGroupIds),
        fetchFixtureGroupTeamsForGroups(supabase, createGroupIds),
      ])
      if (linkRes.error) {
        setMessage(linkRes.error.message)
        setClientCreatePreview(null)
        setCreateClientGraph(null)
        setClientPreviewLoadingCreate(false)
        return
      }
      if (coreRes.error) setMessage(coreRes.error.message)
      const graph: PoolPreviewGraph = {
        links: linkRes.links,
        aliasesByGroupId: fixtureAliasMapRef.current,
        coreTeamsByGroupId: coreRes.coreTeamsByGroupId,
      }
      const prev = computePoolCreationPreview(
        createGroupIds,
        fixtureGroups,
        poolPreviewMatchesRef.current,
        graph,
        createSelectedTeamNames
      )
      previewCacheRef.current.set(key, { preview: prev, graph })
      if (previewCacheRef.current.size > 48) {
        const first = previewCacheRef.current.keys().next().value
        if (first !== undefined) previewCacheRef.current.delete(first)
      }
      setClientCreatePreview(prev)
      setCreateClientGraph(graph)
      setClientPreviewLoadingCreate(false)
    }, 280)
    return () => window.clearTimeout(t)
  }, [createClientPreviewKey, createGroupIds, createSelectedTeamNames, fixtureGroups])

  useEffect(() => {
    const ids = [...new Set(selectedGroupIds)]
    if (ids.length === 0) {
      setEditPreview(null)
      return
    }
    setEditPreviewLoading(true)
    previewPoolGroups(supabase, ids, schoolsCompetitionId ?? undefined).then(({ preview, error }) => {
      if (error) {
        setMessage(error.message)
        setEditPreview(null)
      } else {
        setEditPreview(preview)
      }
      setEditPreviewLoading(false)
    })
  }, [selectedGroupIds, schoolsCompetitionId])

  const editClientPreviewKey = useMemo(
    () =>
      `e|${[...selectedGroupIds].sort().join('|')}__${[...editPoolTeamNames].sort().join('›')}`,
    [selectedGroupIds, editPoolTeamNames]
  )

  useEffect(() => {
    if (selectedGroupIds.length === 0 && editPoolTeamNames.length === 0) {
      setClientEditPreview(null)
      setClientPreviewLoadingEdit(false)
      return
    }
    const key = editClientPreviewKey
    const cached = previewCacheRef.current.get(key)
    if (cached) {
      setClientEditPreview(cached.preview)
      setClientPreviewLoadingEdit(false)
      return
    }
    setClientPreviewLoadingEdit(true)
    const t = window.setTimeout(async () => {
      if (selectedGroupIds.length === 0) {
        const graph: PoolPreviewGraph = {
          links: [],
          aliasesByGroupId: fixtureAliasMapRef.current,
          coreTeamsByGroupId: new Map(),
        }
        const prev = computePoolCreationPreview(
          [],
          fixtureGroups,
          poolPreviewMatchesRef.current,
          graph,
          editPoolTeamNames
        )
        previewCacheRef.current.set(key, { preview: prev, graph })
        setClientEditPreview(prev)
        setClientPreviewLoadingEdit(false)
        return
      }

      const [linkRes, coreRes] = await Promise.all([
        fetchGameMatchGroupLinksForGroups(supabase, selectedGroupIds),
        fetchFixtureGroupTeamsForGroups(supabase, selectedGroupIds),
      ])
      if (linkRes.error) {
        setMessage(linkRes.error.message)
        setClientEditPreview(null)
        setClientPreviewLoadingEdit(false)
        return
      }
      if (coreRes.error) setMessage(coreRes.error.message)
      const graph: PoolPreviewGraph = {
        links: linkRes.links,
        aliasesByGroupId: fixtureAliasMapRef.current,
        coreTeamsByGroupId: coreRes.coreTeamsByGroupId,
      }
      const prev = computePoolCreationPreview(
        selectedGroupIds,
        fixtureGroups,
        poolPreviewMatchesRef.current,
        graph,
        editPoolTeamNames
      )
      previewCacheRef.current.set(key, { preview: prev, graph })
      if (previewCacheRef.current.size > 48) {
        const first = previewCacheRef.current.keys().next().value
        if (first !== undefined) previewCacheRef.current.delete(first)
      }
      setClientEditPreview(prev)
      setClientPreviewLoadingEdit(false)
    }, 280)
    return () => window.clearTimeout(t)
  }, [editClientPreviewKey, fixtureGroups, selectedGroupIds, editPoolTeamNames])

  const mergedCreatePreview = useMemo(
    () => mergePoolPreviewSources(createPreview, clientCreatePreview),
    [createPreview, clientCreatePreview]
  )

  const matchesThisWeekCount = useMemo(() => {
    if (createGroupIds.length === 0 && createSelectedTeamNames.length === 0) return null
    if (clientPreviewLoadingCreate && createGroupIds.length > 0) return null
    const graph: PoolPreviewGraph =
      createClientGraph ?? {
        links: [],
        aliasesByGroupId: fixtureAliasMap,
        coreTeamsByGroupId: new Map(),
      }
    const now = Date.now()
    return countPoolCreationMatchesInKickoffWindow(
      createGroupIds,
      fixtureGroups,
      poolPreviewMatches,
      graph,
      createSelectedTeamNames,
      now,
      now + 7 * 24 * 60 * 60 * 1000,
      now
    )
  }, [
    createClientGraph,
    createGroupIds,
    createSelectedTeamNames,
    clientPreviewLoadingCreate,
    fixtureAliasMap,
    fixtureGroups,
    poolPreviewMatches,
  ])

  const mergedEditPreview = useMemo(
    () => mergePoolPreviewSources(editPreview, clientEditPreview),
    [editPreview, clientEditPreview]
  )

  async function onCreatePool() {
    const nameTrim = createName.trim()
    if (!nameTrim) {
      setMessage('Enter a pool name.')
      return
    }
    if (!createScopeValid) {
      setMessage('Choose at least one province, event, or team.')
      return
    }
    if (!canCreatePool) {
      setMessage(POOL_CREATION_LIMIT_MESSAGE)
      return
    }
    if (createJoinCodeError) {
      setMessage(createJoinCodeError)
      return
    }
    setCreating(true)
    setMessage('')
    try {
      const { pool, error } = await createPool(supabase, {
        name: nameTrim,
        isPublic: createPublic,
        joinCode: createJoinCode.trim() || null,
      })
      if (error || !pool) {
        setMessage(error?.message ?? 'Could not create pool.')
        return
      }
      if (createGroupIds.length > 0) {
        const setGroupsRes = await setPoolGroups(supabase, pool.id, createGroupIds)
        if (setGroupsRes.error) {
          setMessage(setGroupsRes.error.message)
          return
        }
      }
      const teamsRes = await replacePoolTeams(supabase, pool.id, createSelectedTeamNames)
      if (teamsRes.error) {
        setMessage(teamsRes.error.message)
        return
      }
      setCreateName('')
      setCreateJoinCode('')
      setCreatePublic(false)
      setCreateSelectedGroupIds([])
      setCreateSelectedTeamNames([])
      await loadPools()
      setSelectedPoolId(pool.id)
      setMessage(
        `Pool created. Share code ${formatPoolJoinCodeDisplay(pool.join_code)} or copy the invite link.`
      )
    } finally {
      setCreating(false)
    }
  }

  async function onSearchPools() {
    if (!canJoinPool) {
      setMessage(`You have reached the limit of ${MAX_USER_MEMBERSHIPS} pools.`)
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

  async function onRequestJoin(poolId: string, joinCode?: string) {
    if (!canJoinPool) {
      setMessage(`You have reached the limit of ${MAX_USER_MEMBERSHIPS} pools.`)
      return
    }
    const { error, alreadySent } = await requestJoinPool(supabase, poolId, {
      joinCode: joinCode || undefined,
    })
    if (error) {
      if (alreadySent || isPoolJoinRequestAlreadySentError(error)) {
        setMessage('Request already sent.')
      } else {
        setMessage(error.message)
      }
      return
    }
    setMessage('Request sent to pool admin.')
    await loadPools()
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
    await loadPools()
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
    const allowedGroupIds = selectedGroupIds.filter((id) => {
      const g = fixtureGroups.find((x) => x.id === id)
      return g && !isManagePoolHiddenGroup(g)
    })
    const { error } = await setPoolGroups(supabase, selectedPoolId, allowedGroupIds)
    setSavingGroups(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Provinces & competitions saved.')
    await loadPoolDetails()
  }

  async function onSavePoolTeams() {
    if (!selectedPoolId || !isSelectedPoolAdmin) return
    setSavingPoolTeams(true)
    setMessage('')
    const { error } = await replacePoolTeams(supabase, selectedPoolId, editPoolTeamNames)
    setSavingPoolTeams(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Pool teams saved.')
    await loadPoolDetails()
  }

  async function onConfirmDeletePool() {
    if (!selectedPool || !canDeleteSelectedPool) return

    setDeletingPoolId(selectedPool.id)
    const deletingId = selectedPool.id
    const { error } = await deletePool(supabase, deletingId)
    setDeletingPoolId(null)
    if (error) {
      setMessage(error.message)
      return
    }

    setDeleteConfirmOpen(false)
    setMessage('Pool deleted')
    await loadPools()
    setSelectedPoolId((prev) => (prev === deletingId ? null : prev))
    router.push(`/competitions/${SCHOOLS_COMPETITION_SLUG}/pools`)
  }

  async function copyInviteLink() {
    if (!selectedPool || typeof window === 'undefined' || !user) return
    const url = `${window.location.origin}${buildPoolJoinPath(selectedPool.invite_token, user.id, SCHOOLS_COMPETITION_SLUG)}`
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
    } catch {
      setMessage('Could not copy invite link.')
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

  function formatFixturePreviewDay(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    } catch {
      return iso.slice(0, 10)
    }
  }

  function renderPreviewPanel(params: {
    title?: string
    /** True when at least one province/competition is ticked and/or optional teams are chosen. */
    hasSelection: boolean
    loading: boolean
    preview: {
      total_matches: number
      teams: string[]
      fixtures: { match_id: string; home_team: string; away_team: string; kickoff_time: string; group_names: string[] }[]
    } | null
    teamFilterNote?: string | null
  }) {
    const { title = 'PREVIEW YOUR POOL', hasSelection, loading, preview, teamFilterNote } = params
    const teamCount = preview?.teams?.length ?? 0
    const hasTeams = teamCount > 0
    const hasFixtures = (preview?.total_matches ?? 0) > 0 || (preview?.fixtures?.length ?? 0) > 0
    const livePulse = loading && preview !== null

    return (
      <div
        className={`rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/90 p-4 shadow-inner transition ${
          livePulse ? 'ring-2 ring-emerald-200/80' : ''
        }`}
      >
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{title}</h3>
        {!hasSelection ? (
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            Select at least one province, event, competition, or team to preview your pool.
          </p>
        ) : loading && !preview ? (
          <p className="mt-3 text-sm text-gray-500">Updating preview…</p>
        ) : !preview ? (
          <p className="mt-3 text-sm text-gray-600">No preview data for this selection yet.</p>
        ) : !hasTeams && !hasFixtures ? (
          <p className="mt-3 text-sm text-gray-600">Nothing matched in the preview window for this selection.</p>
        ) : (
          <>
            {teamFilterNote ? <p className="mt-2 text-xs font-medium leading-relaxed text-amber-900">{teamFilterNote}</p> : null}
            {loading ? (
              <p className="mt-2 text-[11px] font-medium text-emerald-800">Refreshing…</p>
            ) : null}

            <p className="mt-3 text-sm text-gray-900">
              <span className="font-bold tabular-nums">{preview.total_matches}</span>{' '}
              <span className="text-gray-600">matches in scope</span>
            </p>

            <div className="mt-5 border-t border-gray-200 pt-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-gray-700">Teams in this pool</h4>
              {hasTeams ? (
                <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {preview.teams.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800 shadow-sm"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">No team names resolved yet.</p>
              )}
            </div>

            <div className="mt-5 border-t border-gray-200 pt-4">
              <h4 className="text-xs font-black uppercase tracking-wide text-gray-700">Upcoming fixtures in this pool</h4>
              <p className="mt-1 text-[11px] text-gray-500">Next {Math.min(10, preview.fixtures.length)} upcoming (preview).</p>
              {preview.fixtures.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {preview.fixtures.map((f) => (
                    <li key={f.match_id} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-semibold text-gray-500">{formatFixturePreviewDay(f.kickoff_time)}</p>
                      <p className="mt-0.5 font-bold text-gray-900">
                        {f.home_team} <span className="font-normal text-gray-400">vs</span> {f.away_team}
                      </p>
                      {f.group_names.length > 0 ? (
                        <p className="mt-1 text-[10px] text-gray-500">{f.group_names.join(' · ')}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-gray-500">No upcoming fixtures in the preview window.</p>
              )}
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

      <section className="mt-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black uppercase tracking-wide text-gray-900">Join / search pool</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            Enter a pool code, pool name, or paste an invite token. Invite links still open the join flow.{' '}
            {isUserAdmin ? 'Admins can join unlimited pools.' : `You can belong to up to ${MAX_USER_MEMBERSHIPS} pools.`}
          </p>
          {hasReachedMembershipLimit ? (
            <p className="mt-2 text-xs font-semibold text-red-700">You have reached the limit of 3 pools.</p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={searchQuery}
              disabled={!canJoinPool}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter pool code or pool name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100"
            />
            <button
              type="button"
              disabled={!canJoinPool || searching}
              onClick={() => void onSearchPools()}
              className="shrink-0 rounded-xl border border-gray-900 bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {publicRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatPoolJoinCodeDisplay(r.join_code)}
                    {r.competition_name ? ` · ${r.competition_name}` : ''}
                    {r.admin_display_name ? ` · ${r.admin_display_name}` : ''}
                    {!r.is_public ? ' · Private' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canJoinPool}
                  onClick={() => void onRequestJoin(r.id, r.join_code)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                >
                  Request join
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-black uppercase tracking-wide text-gray-900">Create your own pool</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
          Add teams and provinces or competitions in a few taps. The summary updates as you go — name your pool, build
          your mix, then save.
        </p>
        {hasReachedCreateLimit ? (
          <p className="mt-2 text-xs font-semibold text-red-700">{POOL_CREATION_LIMIT_MESSAGE}</p>
        ) : null}

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Pool name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Pool name"
                disabled={!canCreatePool}
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100"
              />
              <label className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-gray-400">
                Pool code
              </label>
              <input
                type="text"
                value={createJoinCode}
                onChange={(e) => setCreateJoinCode(e.target.value)}
                placeholder="e.g. boishaai1, cw2026 — optional"
                disabled={!canCreatePool}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm disabled:bg-gray-100"
              />
              {createJoinCodeError ? (
                <p className="mt-1 text-xs text-red-700">{createJoinCodeError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">4–20 letters and numbers. Auto-generated if blank.</p>
              )}
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={createPublic}
                  onChange={(e) => setCreatePublic(e.target.checked)}
                  disabled={!canCreatePool}
                  className="mt-1 rounded border-gray-300"
                />
                <span>
                  <span className="font-semibold">Public pool</span>
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    Searchable by name. Private pools can still be found by exact pool code.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!canCreatePool}
                onClick={() => setTeamsModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/60 px-4 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-100/80 disabled:opacity-50"
              >
                <span className="text-lg leading-none">+</span>
                Add teams
              </button>
              <button
                type="button"
                disabled={!canCreatePool}
                onClick={() => setScopeModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/60 px-4 py-3 text-sm font-bold text-sky-950 shadow-sm transition hover:border-sky-500 hover:bg-sky-100/80 disabled:opacity-50"
              >
                <span className="text-lg leading-none">+</span>
                Add province / league / event
              </button>
            </div>

            <button
              type="button"
              onClick={() => void onCreatePool()}
              disabled={!canCreatePool || creating || !createNameValid || !createScopeValid || Boolean(createJoinCodeError)}
              className="w-full rounded-xl bg-gray-900 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-black disabled:opacity-50 sm:w-auto sm:px-10"
            >
              {creating ? 'Saving…' : 'Save pool'}
            </button>
          </div>

          <div className="lg:sticky lg:top-6">
            <div className="rounded-2xl border-2 border-emerald-200/70 bg-gradient-to-br from-white via-white to-emerald-50/50 p-5 shadow-inner ring-1 ring-emerald-100/80">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-900/90">Your pool includes</h3>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Teams</p>
                  {createSelectedTeamNames.length === 0 ? (
                    <p className="mt-1.5 text-sm text-gray-500">None yet — use Add teams.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {createSelectedTeamNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-white py-1 pl-1 pr-3 text-xs font-semibold text-gray-900 shadow-sm"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-50 ring-1 ring-gray-200">
                              <CompetitionTeamLogo
                                competitionSlug={SCHOOLS_COMPETITION_SLUG}
                                teamName={name}
                                size={24}
                                variant="crest"
                              />
                            </span>
                            <span className="truncate">{name}</span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Provinces</p>
                  {createSummaryProvinces.length === 0 ? (
                    <p className="mt-1.5 text-sm text-gray-500">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {createSummaryProvinces.map((g) => (
                        <li key={g.id} className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <ProvinceLogoMark label={g.name} slug={g.slug} size={28} className="shadow-sm" />
                          {g.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Events</p>
                  {createSummaryEvents.length === 0 ? (
                    <p className="mt-1.5 text-sm text-gray-500">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {createSummaryEvents.map((g) => (
                        <li key={g.id} className="text-sm font-semibold text-gray-900">
                          {g.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-emerald-100 pt-4">
                <p className="text-sm font-bold text-gray-900">
                  Matches this week:{' '}
                  <span className="tabular-nums text-emerald-800">
                    {matchesThisWeekCount === null ? '…' : matchesThisWeekCount}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Upcoming / locked in the next 7 days that match your current mix. Fixtures in scope (all statuses):{' '}
                  <span className="font-semibold text-gray-700">{mergedCreatePreview?.total_matches ?? 0}</span>
                  {(createPreviewLoading || clientPreviewLoadingCreate) &&
                  (createGroupIds.length > 0 || createSelectedTeamNames.length > 0) ? (
                    <span className="ml-1 text-emerald-700">· updating…</span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </div>

        <PoolCreateSelectTeamsModal
          open={teamsModalOpen}
          onClose={() => setTeamsModalOpen(false)}
          allCanonicalNames={canonicalTeamNames}
          aliasKeyToCanonical={poolPickerAliasLookup}
          initialSelected={createSelectedTeamNames}
          onDone={setCreateSelectedTeamNames}
        />
        <PoolCreateScopeModal
          open={scopeModalOpen}
          onClose={() => setScopeModalOpen(false)}
          provinces={managePoolSections.provinces}
          eventsAndLeagues={eventsAndLeaguesFlat}
          selectedGroupIds={createSelectedGroupIds}
          onChangeSelectedGroupIds={setCreateSelectedGroupIds}
          groupTeams={scopeGroupTeams}
          aliasKeyToCanonical={poolPickerAliasLookup}
          selectedTeamNames={createSelectedTeamNames}
          onChangeSelectedTeamNames={setCreateSelectedTeamNames}
        />
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
                  <PoolLogo logoUrl={p.logo_url} name={p.name} size="sm" />
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
          ) : !canManageSelectedPool ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">You are a member of this pool. Admin tools are available to the pool owner or app admins.</p>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Teams in this pool</h3>
                {poolTeamsRows.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">All fixtures from the pool&apos;s fixture groups apply (no team filter).</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {poolTeamsRows.map((r) => (
                      <span
                        key={r.id}
                        className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-800"
                      >
                        {r.team_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-black text-gray-900">{selectedPool.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {selectedPool.join_code ? (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-800">
                    {formatPoolJoinCodeDisplay(selectedPool.join_code)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void copyJoinCode()}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                >
                  Copy pool code
                </button>
                {codeCopied ? <span className="text-sm font-medium text-emerald-800">Pool code copied.</span> : null}
                <button
                  type="button"
                  onClick={() => void copyInviteLink()}
                  className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                >
                  Copy invite link
                </button>
                {inviteCopied ? <span className="text-sm font-medium text-emerald-800">Invite link copied.</span> : null}
                {canDeleteSelectedPool ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deletingPoolId === selectedPool.id}
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingPoolId === selectedPool.id ? 'Deleting…' : 'Delete Pool'}
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
                          <button type="button" onClick={() => void onReview(r.id, 'decline')} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800">Decline</button>
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

              <div className="mt-6 rounded-xl border border-gray-200 p-3">
                <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Teams in this pool</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Shown to members. When teams are set, the pool includes every non-cancelled fixture where the home or
                  away team is listed here.
                </p>
                {poolTeamsRows.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {poolTeamsRows.map((r) => (
                      <span
                        key={r.id}
                        className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-800"
                      >
                        {r.team_name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">No team filter — fixture groups only.</p>
                )}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Edit team selection</p>
                  <div className="mt-2">
                    <PoolTeamPicker
                      allTeams={canonicalTeamNames}
                      selected={editPoolTeamNames}
                      onChange={setEditPoolTeamNames}
                      disabled={savingPoolTeams}
                      aliasKeyToCanonical={poolPickerAliasLookup}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void onSavePoolTeams()}
                    disabled={savingPoolTeams}
                    className="mt-3 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingPoolTeams ? 'Saving…' : 'Save pool teams'}
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-gray-700">Provinces, events, and competitions</h3>
                  <div className="mt-3 space-y-5 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
                    {visibleFixtureGroups.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No fixture groups found. Create groups in Admin {'>'} Fixture groups / leagues.
                      </p>
                    ) : (
                      <>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Provinces</p>
                          {managePoolSections.provinces.length === 0 ? (
                            <p className="mt-1.5 text-sm text-gray-500">No province groups.</p>
                          ) : (
                            <div className="mt-1 grid gap-2">
                              {managePoolSections.provinces.map((m) => (
                                <label key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedGroupIds.includes(m.id)}
                                    onChange={(e) => {
                                      setSelectedGroupIds((prev) =>
                                        e.target.checked ? [...new Set([...prev, m.id])] : prev.filter((id) => id !== m.id)
                                      )
                                    }}
                                  />
                                  <ProvinceLogoMark label={m.name} slug={m.slug} size={28} className="shadow-sm" />
                                  <span className="flex flex-1 flex-wrap items-baseline gap-x-1.5 text-gray-800">
                                    <span>{m.name}</span>
                                    {(teamCountsByGroupId.get(m.id) ?? 0) > 0 ? (
                                      <span className="text-[11px] font-semibold text-gray-400">
                                        ({teamCountsByGroupId.get(m.id)} teams)
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Events and other</p>
                          {managePoolSections.events.length === 0 ? (
                            <p className="mt-1.5 text-sm text-gray-500">No prestige or WP Premium group.</p>
                          ) : (
                            <div className="mt-1 grid gap-2">
                              {managePoolSections.events.map((m) => (
                                <label key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedGroupIds.includes(m.id)}
                                    onChange={(e) => {
                                      setSelectedGroupIds((prev) =>
                                        e.target.checked ? [...new Set([...prev, m.id])] : prev.filter((id) => id !== m.id)
                                      )
                                    }}
                                  />
                                  <span className="flex flex-1 flex-wrap items-baseline gap-x-1.5 text-gray-800">
                                    <span>{m.name}</span>
                                    {(teamCountsByGroupId.get(m.id) ?? 0) > 0 ? (
                                      <span className="text-[11px] font-semibold text-gray-400">
                                        ({teamCountsByGroupId.get(m.id)} teams)
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        {managePoolSections.groupedOther.map((group) => (
                          <div key={group.type}>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{group.label}</p>
                            <div className="mt-1 grid gap-2">
                              {group.items.map((m) => (
                                <label key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedGroupIds.includes(m.id)}
                                    onChange={(e) => {
                                      setSelectedGroupIds((prev) =>
                                        e.target.checked ? [...new Set([...prev, m.id])] : prev.filter((id) => id !== m.id)
                                      )
                                    }}
                                  />
                                  <span className="flex flex-1 flex-wrap items-baseline gap-x-1.5 text-gray-800">
                                    <span>{m.name}</span>
                                    {(teamCountsByGroupId.get(m.id) ?? 0) > 0 ? (
                                      <span className="text-[11px] font-semibold text-gray-400">
                                        ({teamCountsByGroupId.get(m.id)} teams)
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onSaveMatches()}
                    disabled={savingGroups}
                    className="mt-3 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingGroups ? 'Saving…' : 'Save provinces & competitions'}
                  </button>
                  <p className="mt-2 text-xs text-gray-500">
                    Pool fixtures follow these selections; optional teams above narrow further when set.
                  </p>
                </div>
                <div>
                  {renderPreviewPanel({
                    hasSelection: selectedGroupIds.length > 0 || editPoolTeamNames.length > 0,
                    loading:
                      (selectedGroupIds.length > 0 || editPoolTeamNames.length > 0) &&
                      (editPreviewLoading || clientPreviewLoadingEdit) &&
                      !mergedEditPreview,
                    preview: mergedEditPreview,
                    teamFilterNote:
                      editPoolTeamNames.length > 0 && selectedGroupIds.length > 0
                        ? 'With teams and groups both set, fixtures are narrowed to games that match your groups and involve a selected team.'
                        : null,
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <DeletePoolConfirmModal
        open={deleteConfirmOpen}
        deleting={deletingPoolId != null}
        onCancel={() => {
          if (deletingPoolId == null) setDeleteConfirmOpen(false)
        }}
        onConfirm={() => void onConfirmDeletePool()}
      />
    </main>
  )
}
