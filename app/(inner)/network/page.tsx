'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import RequireAdmin from '@/components/admin/RequireAdmin'

type Team = { id: number; name: string }

type Match = {
    id: number
    season: number
    match_date: string
    team_a_id: number
    team_b_id: number
    team_a_score: number
    team_b_score: number
}

type PositionedNode = {
  id: number
    name: string
    margin: number
  depth: number
  row: number
  x: number
  y: number
  pinned: boolean
  logoSrc: string
}

const PINNED_TEAM_NAMES = new Set([
  'Afrikaans Hoër Seuns',
  'Afrikaans Hoer Seuns',
  'Grey College',
  'Paarl Gimnasium',
  'Paarl Boys High',
  'Northwood',
  'Westville',
  'Stellenberg',
  'Garsfontein',
  'Paul Roos',
  'Hilton College',
])

const CHART_WIDTH = 1800
const CHART_HEIGHT = 860
const CHART_MARGIN = { left: 120, right: 80, top: 80, bottom: 80 }
const ROW_Y = [220, 430, 640]
const NODE_RADIUS = 9
const MAX_LEVEL = 3

function slugifyTeamName(name: string) {
    return name
        .toLowerCase()
        .trim()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function getBaselineLayoutData(matches: Match[], baselineTeamId: number, maxDepth: number) {
    const adjacency: Record<
        number,
        Array<{ opponentId: number; marginFromCurrent: number; matchId: number }>
    > = {}

    for (const match of matches) {
        if (!adjacency[match.team_a_id]) adjacency[match.team_a_id] = []
        if (!adjacency[match.team_b_id]) adjacency[match.team_b_id] = []

        const margin = match.team_a_score - match.team_b_score
        adjacency[match.team_a_id].push({
            opponentId: match.team_b_id,
            marginFromCurrent: -margin,
            matchId: match.id,
        })
        adjacency[match.team_b_id].push({
            opponentId: match.team_a_id,
            marginFromCurrent: margin,
            matchId: match.id,
        })
    }

    const directOpponents = new Set<number>()
    for (const match of matches) {
    if (match.team_a_id === baselineTeamId) directOpponents.add(match.team_b_id)
    if (match.team_b_id === baselineTeamId) directOpponents.add(match.team_a_id)
    }

    const visited = new Set<number>([baselineTeamId])
    const depthMap = new Map<number, number>()
    const marginMap = new Map<number, number>()
    const parentMap = new Map<number, number | null>()
    const matchMap = new Map<number, number | null>()

    depthMap.set(baselineTeamId, 0)
    marginMap.set(baselineTeamId, 0)
    parentMap.set(baselineTeamId, null)
    matchMap.set(baselineTeamId, null)

    const queue: Array<{ teamId: number; depth: number; cumulativeMargin: number }> = [
        { teamId: baselineTeamId, depth: 0, cumulativeMargin: 0 },
    ]

    while (queue.length > 0) {
        const current = queue.shift()!
        if (current.depth >= maxDepth) continue
        const neighbours = adjacency[current.teamId] || []

        for (const neighbour of neighbours) {
      if (visited.has(neighbour.opponentId)) continue
                visited.add(neighbour.opponentId)

                let nextDepth = current.depth + 1
      if (directOpponents.has(neighbour.opponentId)) nextDepth = 1

                const nextMargin = current.cumulativeMargin + neighbour.marginFromCurrent
                depthMap.set(neighbour.opponentId, nextDepth)
                marginMap.set(neighbour.opponentId, nextMargin)
                parentMap.set(neighbour.opponentId, current.teamId)
                matchMap.set(neighbour.opponentId, neighbour.matchId)

                queue.push({
                    teamId: neighbour.opponentId,
                    depth: nextDepth,
                    cumulativeMargin: nextMargin,
                })
            }
        }

  return { reachableTeamIds: visited, depthMap, marginMap, parentMap, matchMap }
}

function rowFromDepth(depth: number) {
  if (depth <= 1) return 0
  if (depth === 2) return 1
  return 2
}

function pathToBaseline(teamId: number, parentMap: Map<number, number | null>) {
  const ids = new Set<number>()
  let current: number | null | undefined = teamId
  while (current !== null && current !== undefined) {
    ids.add(current)
    current = parentMap.get(current)
  }
  return ids
}

function NetworkPageContent() {
    const [teams, setTeams] = useState<Team[]>([])
    const [matches, setMatches] = useState<Match[]>([])
    const [season, setSeason] = useState('2026')
    const [baselineTeam, setBaselineTeam] = useState('')
  const [viewLevel, setViewLevel] = useState(3)
  const [searchTerm, setSearchTerm] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [compareA, setCompareA] = useState('')
  const [compareB, setCompareB] = useState('')
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null)
  const [logoStatus, setLogoStatus] = useState<Record<string, 'loaded' | 'failed'>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        async function loadTeams() {
      const { data, error: teamsError } = await supabase
                .from('teams')
                .select('id, name')
                .order('name')

      if (teamsError) {
        setError(teamsError.message)
                return
            }

            const loadedTeams = (data as Team[]) || []
            setTeams(loadedTeams)
      const grey = loadedTeams.find((team) => team.name.trim().toLowerCase() === 'grey college')
      if (grey) setBaselineTeam(String(grey.id))
        }

        loadTeams()
    }, [])

    useEffect(() => {
        async function loadMatches() {
            setLoading(true)
            setError('')
      const { data, error: matchesError } = await supabase
                .from('matches')
                .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
                .eq('season', Number(season))
                .order('match_date', { ascending: true })

      if (matchesError) {
        setError(matchesError.message)
                setMatches([])
            } else {
                setMatches((data as Match[]) || [])
            }
            setLoading(false)
        }

        loadMatches()
    }, [season])

  useEffect(() => {
    setViewLevel(3)
    setActiveTeamId(null)
  }, [baselineTeam, season])

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])

    const baselineReachability = useMemo(() => {
        if (!baselineTeam) {
            return {
                reachableTeamIds: new Set<number>(),
                depthMap: new Map<number, number>(),
                marginMap: new Map<number, number>(),
                parentMap: new Map<number, number | null>(),
                matchMap: new Map<number, number | null>(),
            }
        }
    return getBaselineLayoutData(matches, Number(baselineTeam), viewLevel)
  }, [matches, baselineTeam, viewLevel])

  const reachableMatches = useMemo(() => {
    if (!baselineTeam) return []
        return matches.filter(
            (m) =>
                baselineReachability.reachableTeamIds.has(m.team_a_id) &&
                baselineReachability.reachableTeamIds.has(m.team_b_id)
        )
  }, [matches, baselineReachability, baselineTeam])

  const teamIdsInScope = useMemo(() => {
    const ids = new Set<number>()
    reachableMatches.forEach((m) => {
      ids.add(m.team_a_id)
      ids.add(m.team_b_id)
    })
    return ids
  }, [reachableMatches])

  const comparisonRelevantSet = useMemo(() => {
    if (!compareMode || !compareA || !compareB || !baselineTeam) return null
    const a = Number(compareA)
    const b = Number(compareB)
    if (!teamIdsInScope.has(a) || !teamIdsInScope.has(b)) return null

    const ids = new Set<number>([Number(baselineTeam), a, b])
    pathToBaseline(a, baselineReachability.parentMap).forEach((id) => ids.add(id))
    pathToBaseline(b, baselineReachability.parentMap).forEach((id) => ids.add(id))
    return ids
  }, [compareMode, compareA, compareB, baselineTeam, baselineReachability.parentMap, teamIdsInScope])

  const searchedIds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return new Set<number>()
    const ids = new Set<number>()
    teams.forEach((team) => {
      if (team.name.toLowerCase().includes(q)) ids.add(team.id)
    })
    return ids
  }, [searchTerm, teams])

  const visibleTeamIds = useMemo(() => {
    if (!baselineTeam) return new Set<number>()

    const byDepth = new Set<number>()
    for (const teamId of teamIdsInScope) {
      const d = baselineReachability.depthMap.get(teamId) ?? 99
      if (d <= viewLevel || d <= 1) byDepth.add(teamId)
    }

    const visible = new Set<number>(byDepth)
    if (comparisonRelevantSet) {
      for (const id of Array.from(visible)) {
        if (!comparisonRelevantSet.has(id)) visible.delete(id)
      }
    }

    if (searchedIds.size > 0) {
      const focused = new Set<number>([Number(baselineTeam)])
      searchedIds.forEach((id) => {
        if (visible.has(id)) {
          focused.add(id)
          const parent = baselineReachability.parentMap.get(id)
          if (parent !== null && parent !== undefined) focused.add(parent)
        }
      })
      return focused
    }

    return visible
  }, [
    baselineTeam,
    baselineReachability.depthMap,
    baselineReachability.parentMap,
    comparisonRelevantSet,
    viewLevel,
    searchedIds,
    teamIdsInScope,
  ])

  const visibleMatches = useMemo(
    () =>
      reachableMatches.filter(
        (m) => visibleTeamIds.has(m.team_a_id) && visibleTeamIds.has(m.team_b_id)
      ),
    [reachableMatches, visibleTeamIds]
  )

  const chartDomain = useMemo(() => {
    const ids = Array.from(visibleTeamIds)
    if (ids.length === 0) return { min: -50, max: 50 }

    const raw = ids.map((id) => {
      const name = teamById.get(id)?.name || `Team ${id}`
            return {
        margin: baselineReachability.marginMap.get(id) ?? 0,
        pinned: PINNED_TEAM_NAMES.has(name) || String(id) === baselineTeam,
        logoSrc: `/team-logos/${slugifyTeamName(name)}.png`,
      }
    })

    const pinnedMargins = raw.filter((n) => n.pinned).map((n) => n.margin)
    const center = pinnedMargins.length
      ? pinnedMargins.reduce((sum, value) => sum + value, 0) / pinnedMargins.length
      : 0
    const pinnedSpread = pinnedMargins.length
      ? Math.max(...pinnedMargins) - Math.min(...pinnedMargins)
      : 80
    const domainHalfSpan = Math.max(50, pinnedSpread / 2 + 40)
    return {
      min: center - domainHalfSpan,
      max: center + domainHalfSpan,
    }
  }, [visibleTeamIds, teamById, baselineReachability.marginMap, baselineTeam])

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const ids = Array.from(visibleTeamIds)
    if (ids.length === 0) return []

    const raw = ids.map((id) => {
      const name = teamById.get(id)?.name || `Team ${id}`
            return {
        id,
        name,
        margin: baselineReachability.marginMap.get(id) ?? 0,
        depth: baselineReachability.depthMap.get(id) ?? 0,
        row: rowFromDepth(baselineReachability.depthMap.get(id) ?? 0),
        pinned: PINNED_TEAM_NAMES.has(name) || String(id) === baselineTeam,
        logoSrc: `/team-logos/${slugifyTeamName(name)}.png`,
      }
    })

    const toX = (margin: number) => {
      const bounded = Math.min(chartDomain.max, Math.max(chartDomain.min, margin))
      const width = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
      return (
        CHART_MARGIN.left +
        ((bounded - chartDomain.min) / (chartDomain.max - chartDomain.min || 1)) * width
      )
    }

    return raw.map((node) => ({
      ...node,
      x: toX(node.margin),
      y: ROW_Y[node.row],
    }))
  }, [
    visibleTeamIds,
    teamById,
    baselineReachability.marginMap,
    baselineReachability.depthMap,
    baselineTeam,
    chartDomain.max,
    chartDomain.min,
  ])

  useEffect(() => {
    positionedNodes.forEach((node) => {
      if (logoStatus[node.logoSrc]) return
      const img = new Image()
      img.onload = () =>
        setLogoStatus((prev) => {
          if (prev[node.logoSrc]) return prev
          return { ...prev, [node.logoSrc]: 'loaded' }
        })
      img.onerror = () =>
        setLogoStatus((prev) => {
          if (prev[node.logoSrc]) return prev
          return { ...prev, [node.logoSrc]: 'failed' }
        })
      img.src = node.logoSrc
    })
  }, [positionedNodes, logoStatus])

  const nodeById = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes]
  )

  const labelLaneMap = useMemo(() => {
    const laneMap = new Map<number, number>()
    const minGap = 110

    for (let row = 0; row < 3; row++) {
      const rowNodes = positionedNodes.filter((n) => n.row === row).sort((a, b) => a.x - b.x)
      const laneLastX: number[] = []

      for (const node of rowNodes) {
        let lane = 0
        while (laneLastX[lane] !== undefined && node.x - laneLastX[lane] < minGap) {
          lane += 1
        }
        laneLastX[lane] = node.x
        laneMap.set(node.id, lane)
      }
    }

    return laneMap
  }, [positionedNodes])

  const relatedToActive = useMemo(() => {
    if (!activeTeamId) return null
    const related = new Set<number>([activeTeamId])

    visibleMatches.forEach((match) => {
      if (match.team_a_id === activeTeamId || match.team_b_id === activeTeamId) {
        related.add(match.team_a_id)
        related.add(match.team_b_id)
      }
    })
    pathToBaseline(activeTeamId, baselineReachability.parentMap).forEach((id) => related.add(id))
    return related
  }, [activeTeamId, visibleMatches, baselineReachability.parentMap])

  const selectedInfo = useMemo(() => {
    if (!activeTeamId) return 'Click a node to focus on one team.'
    const node = nodeById.get(activeTeamId)
    if (!node) return 'Click a node to focus on one team.'
    return `${node.name} | Depth ${node.depth} | Margin ${node.margin > 0 ? '+' : ''}${node.margin}${node.pinned ? ' | Pinned anchor' : ''}`
  }, [activeTeamId, nodeById])

  const showLabelsFor = useMemo(() => {
    const ids = new Set<number>()
    const crowded = positionedNodes.length > 18
    positionedNodes.forEach((node) => {
      if (!crowded || node.pinned) ids.add(node.id)
      if (activeTeamId === node.id) ids.add(node.id)
      if (relatedToActive?.has(node.id)) ids.add(node.id)
      if (searchedIds.has(node.id)) ids.add(node.id)
    })
    return ids
  }, [positionedNodes, activeTeamId, relatedToActive, searchedIds])

  const axisTicks = useMemo(() => {
    const margins = positionedNodes.map((n) => n.margin)
    const min = margins.length ? Math.min(...margins) : -40
    const max = margins.length ? Math.max(...margins) : 40
    const start = Math.floor(min / 10) * 10
    const end = Math.ceil(max / 10) * 10
    const ticks: number[] = []
    for (let m = start; m <= end; m += 10) ticks.push(m)
    if (!ticks.includes(0)) ticks.push(0)
    return ticks.sort((a, b) => a - b)
  }, [positionedNodes])

  const canExpand = viewLevel < MAX_LEVEL

    return (
        <main className="min-h-screen bg-white text-black">
            <div className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="text-3xl font-bold">Visual Graph Dashboard</h1>
                <p className="mt-2 text-gray-600">
          Fixed-axis margin view with structured depth rows for baseline analysis.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="mb-2 block text-sm font-medium">Season</label>
                        <input
                            type="number"
                            value={season}
                            onChange={(e) => setSeason(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium">Baseline Team</label>
                        <select
                            value={baselineTeam}
                            onChange={(e) => setBaselineTeam(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        >
                            <option value="">Choose Baseline Team</option>
                            {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                    {team.name}
                                </option>
                            ))}
                        </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Graph Level</label>
            <div className="inline-flex w-full rounded-xl border border-gray-300 p-1">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setViewLevel(level)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    viewLevel === level
                      ? 'bg-black text-white shadow-sm'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Level {level}
                </button>
              ))}
            </div>
          </div>
                    </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <div>
            <label className="mb-2 block text-sm font-medium">Search Team</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type a school name"
                            className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                compareMode ? 'border-black bg-black text-white' : 'border-gray-300'
              }`}
            >
              {compareMode ? 'Comparison: ON' : 'Comparison: OFF'}
            </button>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Team A</label>
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              disabled={!compareMode}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
            >
              <option value="">Choose team A</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Team B</label>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              disabled={!compareMode}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
            >
              <option value="">Choose team B</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
                        </select>
                    </div>
                </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setViewLevel((d) => Math.min(MAX_LEVEL, d + 1))}
            disabled={!canExpand}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Expand View (Level {viewLevel}/{MAX_LEVEL})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewLevel(3)
              setActiveTeamId(null)
              setSearchTerm('')
            }}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium"
          >
            Reset Focus
          </button>
        </div>

        {loading && <p className="mt-6">Loading visual graph...</p>}
        {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
        {!loading && !error && !baselineTeam && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            Choose a baseline team to start the dashboard.
                    </div>
                )}
        {!loading && !error && baselineTeam && positionedNodes.length === 0 && (
                    <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
                        No connected matches found for this season.
                    </div>
                )}

        {!loading && !error && baselineTeam && positionedNodes.length > 0 && (
                    <>
                        <div className="mt-8 rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center gap-5 text-sm text-gray-700">
                <div><strong>Visible teams:</strong> {positionedNodes.length}</div>
                <div><strong>Visible links:</strong> {visibleMatches.length}</div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-3 w-3 rounded-full bg-[#111827]" />
                  <span>Baseline</span>
                                </div>
                                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#0f766e]" />
                  <span>Pinned anchors</span>
                                </div>
                            </div>

              <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                <svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="#ffffff" />

                  {axisTicks.map((tick) => {
                    const x =
                      CHART_MARGIN.left +
                      ((Math.min(chartDomain.max, Math.max(chartDomain.min, tick)) - chartDomain.min) /
                        (chartDomain.max - chartDomain.min || 1)) *
                        (CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right)
                    return (
                      <g key={tick}>
                        <line x1={x} y1={CHART_MARGIN.top} x2={x} y2={CHART_HEIGHT - CHART_MARGIN.bottom} stroke="#f1f5f9" strokeWidth={1} />
                        <text x={x} y={CHART_MARGIN.top - 12} textAnchor="middle" fontSize="11" fill="#6b7280">{tick}</text>
                      </g>
                    )
                  })}

                  {ROW_Y.map((y, idx) => (
                    <g key={y}>
                      <line x1={CHART_MARGIN.left} y1={y} x2={CHART_WIDTH - CHART_MARGIN.right} y2={y} stroke="#e5e7eb" strokeWidth={1.2} />
                      <text x={24} y={y + 4} fontSize="12" fill="#4b5563">
                        {idx === 0 ? 'Row 1: Baseline + direct opponents' : idx === 1 ? 'Row 2: Depth 2' : 'Row 3: Depth 3'}
                      </text>
                    </g>
                  ))}

                  {visibleMatches.map((match) => {
                    const a = nodeById.get(match.team_a_id)
                    const b = nodeById.get(match.team_b_id)
                    if (!a || !b) return null
                    const isDimmed = relatedToActive && !(relatedToActive.has(a.id) && relatedToActive.has(b.id))
                    return (
                      <line
                        key={match.id}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={Math.max(a.depth, b.depth) <= 1 ? '#94a3b8' : '#cbd5e1'}
                        strokeWidth={1.2}
                        opacity={isDimmed ? 0.08 : 0.4}
                      />
                    )
                  })}

                  {positionedNodes.map((node) => {
                    const isBaseline = String(node.id) === baselineTeam
                    const isDimmed = relatedToActive ? !relatedToActive.has(node.id) : false
                    const isActive = activeTeamId === node.id
                    const hasLogo = logoStatus[node.logoSrc] === 'loaded'
                    const nodeRadius = NODE_RADIUS + (isActive ? 2 : 0)
                    return (
                      <g key={node.id} onClick={() => setActiveTeamId((prev) => (prev === node.id ? null : node.id))} style={{ cursor: 'pointer' }}>
                        {node.pinned && !isBaseline && (
                          <rect x={node.x - 4} y={node.y - 18} width={8} height={8} fill="#0f766e" opacity={isDimmed ? 0.2 : 1} />
                        )}
                        {hasLogo ? (
                          <>
                            <defs>
                              <clipPath id={`node-logo-clip-${node.id}`}>
                                <circle cx={node.x} cy={node.y} r={nodeRadius} />
                              </clipPath>
                            </defs>
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={nodeRadius + (isBaseline ? 3 : 1)}
                              fill={isBaseline ? '#111827' : '#dbeafe'}
                              opacity={isDimmed ? 0.25 : 1}
                            />
                            <image
                              href={node.logoSrc}
                              x={node.x - nodeRadius}
                              y={node.y - nodeRadius}
                              width={nodeRadius * 2}
                              height={nodeRadius * 2}
                              preserveAspectRatio="xMidYMid slice"
                              clipPath={`url(#node-logo-clip-${node.id})`}
                              opacity={isDimmed ? 0.25 : 1}
                            />
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={nodeRadius}
                              fill="none"
                              stroke={isBaseline ? '#111827' : '#ffffff'}
                              strokeWidth={isBaseline ? 2.5 : 1.5}
                              opacity={isDimmed ? 0.25 : 1}
                            />
                          </>
                        ) : (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={nodeRadius}
                            fill={isBaseline ? '#111827' : '#2563eb'}
                            opacity={isDimmed ? 0.2 : 1}
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        )}
                      </g>
                    )
                  })}

                  {positionedNodes
                    .filter((node) => showLabelsFor.has(node.id))
                    .map((node) => {
                      const lane = labelLaneMap.get(node.id) ?? 0
                      const labelY = node.y - NODE_RADIUS - 10 - lane * 16
                      const isDimmed = relatedToActive ? !relatedToActive.has(node.id) : false
                      return (
                        <text
                          key={`label-${node.id}`}
                          x={node.x}
                          y={labelY}
                          textAnchor="middle"
                          fontSize="11"
                          fill={isDimmed ? '#9ca3af' : '#111827'}
                        >
                          {node.name}
                        </text>
                      )
                    })}

                  <line
                    x1={CHART_MARGIN.left + (CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right) / 2}
                    y1={CHART_MARGIN.top}
                    x2={CHART_MARGIN.left + (CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right) / 2}
                    y2={CHART_HEIGHT - CHART_MARGIN.bottom}
                    stroke="#111827"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                </svg>
                            </div>
                        </div>

                        <div className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Focused Team</h2>
              <p className="mt-2 text-gray-700">{selectedInfo}</p>
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}

export default function NetworkPage() {
  return (
    <RequireAdmin>
      <NetworkPageContent />
    </RequireAdmin>
  )
}