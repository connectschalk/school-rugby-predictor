'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
})

type Team = {
  id: number
  name: string
}

type Match = {
  id: number
  season: number
  match_date: string
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
}

type RankedTeam = {
  teamId: number
  teamName: string
  relativeScore: number
  matchesPlayed: number
  pointsFor: number
  pointsAgainst: number
  wins: number
  draws: number
  losses: number
  averageMargin: number
}

type PoolData = {
  poolId: number
  teamIds: number[]
  matches: Match[]
  rankings: RankedTeam[]
}

type GraphNode = {
  id: string
  name: string
  val: number
  poolId: number
  x?: number
  y?: number
  fx?: number
  fy?: number
  relativeScore: number
  rankPosition: number
}

type GraphLink = {
  source: string | GraphNode
  target: string | GraphNode
  label: string
  matchId: number
  poolId: number
  margin: number
}

function buildAdjacency(matches: Match[]) {
  const adjacency: Record<number, Set<number>> = {}

  for (const match of matches) {
    if (!adjacency[match.team_a_id]) adjacency[match.team_a_id] = new Set()
    if (!adjacency[match.team_b_id]) adjacency[match.team_b_id] = new Set()

    adjacency[match.team_a_id].add(match.team_b_id)
    adjacency[match.team_b_id].add(match.team_a_id)
  }

  return adjacency
}

function findConnectedPools(matches: Match[]): number[][] {
  const adjacency = buildAdjacency(matches)
  const visited = new Set<number>()
  const pools: number[][] = []

  for (const teamIdStr of Object.keys(adjacency)) {
    const start = Number(teamIdStr)
    if (visited.has(start)) continue

    const stack = [start]
    const component: number[] = []
    visited.add(start)

    while (stack.length > 0) {
      const current = stack.pop()!
      component.push(current)

      const neighbours = adjacency[current] || new Set<number>()
      for (const next of neighbours) {
        if (!visited.has(next)) {
          visited.add(next)
          stack.push(next)
        }
      }
    }

    component.sort((a, b) => a - b)
    pools.push(component)
  }

  return pools.sort((a, b) => b.length - a.length)
}

function computePoolRankings(poolTeamIds: number[], matches: Match[], teams: Team[]): RankedTeam[] {
  const teamSet = new Set(poolTeamIds)
  const poolMatches = matches.filter(
    (m) => teamSet.has(m.team_a_id) && teamSet.has(m.team_b_id)
  )

  const ratings: Record<number, number> = {}
  const stats: Record<number, RankedTeam> = {}

  for (const teamId of poolTeamIds) {
    const teamName = teams.find((t) => t.id === teamId)?.name || `Team ${teamId}`
    ratings[teamId] = 0
    stats[teamId] = {
      teamId,
      teamName,
      relativeScore: 0,
      matchesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      averageMargin: 0,
    }
  }

  for (const match of poolMatches) {
    const a = stats[match.team_a_id]
    const b = stats[match.team_b_id]
    const margin = match.team_a_score - match.team_b_score

    a.matchesPlayed += 1
    a.pointsFor += match.team_a_score
    a.pointsAgainst += match.team_b_score

    b.matchesPlayed += 1
    b.pointsFor += match.team_b_score
    b.pointsAgainst += match.team_a_score

    if (margin > 0) {
      a.wins += 1
      b.losses += 1
    } else if (margin < 0) {
      b.wins += 1
      a.losses += 1
    } else {
      a.draws += 1
      b.draws += 1
    }
  }

  const iterations = 1200
  const learningRate = 0.02

  for (let i = 0; i < iterations; i++) {
    for (const match of poolMatches) {
      const a = match.team_a_id
      const b = match.team_b_id
      const margin = match.team_a_score - match.team_b_score

      const predicted = ratings[a] - ratings[b]
      const error = predicted - margin

      ratings[a] -= learningRate * error
      ratings[b] += learningRate * error
    }

    const mean =
      poolTeamIds.reduce((sum, id) => sum + ratings[id], 0) / poolTeamIds.length

    for (const teamId of poolTeamIds) {
      ratings[teamId] -= mean
    }
  }

  const ranked = poolTeamIds.map((teamId) => {
    const teamStat = stats[teamId]
    const totalMargin = teamStat.pointsFor - teamStat.pointsAgainst
    const avgMargin =
      teamStat.matchesPlayed > 0 ? totalMargin / teamStat.matchesPlayed : 0

    return {
      ...teamStat,
      relativeScore: Math.round(ratings[teamId] * 10) / 10,
      averageMargin: Math.round(avgMargin * 10) / 10,
    }
  })

  ranked.sort((a, b) => b.relativeScore - a.relativeScore)

  return ranked
}

function getPoolColor(poolId: number) {
  const colors = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#ca8a04',
    '#7c3aed',
    '#0891b2',
    '#ea580c',
    '#be123c',
    '#0f766e',
    '#4f46e5',
  ]

  return colors[(poolId - 1) % colors.length]
}

export default function NetworkPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [season, setSeason] = useState('2026')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedInfo, setSelectedInfo] = useState('')
  const [graphSize, setGraphSize] = useState({ width: 1400, height: 820 })

  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function updateSize() {
      const width = containerRef.current?.clientWidth || 1400
      setGraphSize({ width, height: 820 })
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    async function loadTeams() {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name')
        .order('name')

      if (error) {
        setError(error.message)
        return
      }

      setTeams((data as Team[]) || [])
    }

    loadTeams()
  }, [])

  useEffect(() => {
    async function loadMatches() {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('matches')
        .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
        .eq('season', Number(season))
        .order('match_date', { ascending: true })

      if (error) {
        setError(error.message)
        setMatches([])
      } else {
        setMatches((data as Match[]) || [])
      }

      setLoading(false)
    }

    loadMatches()
  }, [season])

  const pools = useMemo<PoolData[]>(() => {
    const connectedPools = findConnectedPools(matches)

    return connectedPools
      .map((teamIds, index) => {
        const teamSet = new Set(teamIds)
        const poolMatches = matches.filter(
          (m) => teamSet.has(m.team_a_id) && teamSet.has(m.team_b_id)
        )

        const rankings = computePoolRankings(teamIds, matches, teams)

        return {
          poolId: index + 1,
          teamIds,
          matches: poolMatches,
          rankings,
        }
      })
      .sort((a, b) => b.teamIds.length - a.length)
  }, [matches, teams])

  const graphData = useMemo(() => {
    const teamToPool = new Map<number, number>()
    const teamToRanking = new Map<number, RankedTeam>()

    pools.forEach((pool) => {
      pool.teamIds.forEach((teamId) => teamToPool.set(teamId, pool.poolId))
      pool.rankings.forEach((ranking) => teamToRanking.set(ranking.teamId, ranking))
    })

    const teamIdsInMatches = new Set<number>()
    matches.forEach((m) => {
      teamIdsInMatches.add(m.team_a_id)
      teamIdsInMatches.add(m.team_b_id)
    })

    const xLeaderBaseline = 340
    const xPixelsPerMargin = 24
    const poolTopBaseY = 120
    const poolVerticalGap = 230
    const rowGap = 46

    const nodes: GraphNode[] = [...teamIdsInMatches].map((teamId) => {
      const team = teams.find((t) => t.id === teamId)
      const ranking = teamToRanking.get(teamId)
      const poolId = teamToPool.get(teamId) || 0

      const pool = pools.find((p) => p.poolId === poolId)
      const poolRankings = pool?.rankings || []

      const rankPosition =
        poolRankings.findIndex((r) => r.teamId === teamId) >= 0
          ? poolRankings.findIndex((r) => r.teamId === teamId) + 1
          : poolRankings.length

      const matchesPlayed = matches.filter(
        (m) => m.team_a_id === teamId || m.team_b_id === teamId
      ).length

      const relativeScore = ranking?.relativeScore || 0
      const poolLeaderScore = poolRankings.length > 0 ? poolRankings[0].relativeScore : 0
      const relativeFromLeader = relativeScore - poolLeaderScore

      const fixedX = xLeaderBaseline + relativeFromLeader * xPixelsPerMargin
      const fixedY = poolTopBaseY + (poolId - 1) * poolVerticalGap + (rankPosition - 1) * rowGap

      return {
        id: String(teamId),
        name: team?.name || `Team ${teamId}`,
        val: Math.max(6, matchesPlayed * 2),
        poolId,
        relativeScore,
        rankPosition,
        x: fixedX,
        y: fixedY,
        fx: fixedX,
        fy: fixedY,
      }
    })

    const links: GraphLink[] = matches.map((match) => {
      const margin = match.team_a_score - match.team_b_score
      const teamA = teams.find((t) => t.id === match.team_a_id)?.name || `Team ${match.team_a_id}`
      const teamB = teams.find((t) => t.id === match.team_b_id)?.name || `Team ${match.team_b_id}`

      return {
        source: String(match.team_a_id),
        target: String(match.team_b_id),
        label: `${teamA} ${match.team_a_score} - ${match.team_b_score} ${teamB} | margin ${margin > 0 ? '+' : ''}${margin}`,
        matchId: match.id,
        poolId: teamToPool.get(match.team_a_id) || 0,
        margin,
      }
    })

    const nodeById = new Map<string, GraphNode>()
    nodes.forEach((node) => nodeById.set(node.id, node))

    const neighbourXMap = new Map<string, number[]>()

    links.forEach((link) => {
      const sourceId = String(link.source)
      const targetId = String(link.target)

      const sourceNode = nodeById.get(sourceId)
      const targetNode = nodeById.get(targetId)
      if (!sourceNode || !targetNode) return

      if (!neighbourXMap.has(sourceId)) neighbourXMap.set(sourceId, [])
      if (!neighbourXMap.has(targetId)) neighbourXMap.set(targetId, [])

      neighbourXMap.get(sourceId)!.push(targetNode.x || 0)
      neighbourXMap.get(targetId)!.push(sourceNode.x || 0)
    })

    const maxNegativeOffset =
      nodes.length > 0
        ? Math.min(
            ...nodes.map(
              (n) =>
                n.relativeScore -
                (pools.find((p) => p.poolId === n.poolId)?.rankings[0]?.relativeScore || 0)
            )
          )
        : 0

    return {
      nodes,
      links,
      neighbourXMap,
      axis: {
        xLeaderBaseline,
        xPixelsPerMargin,
        maxLeftMargin: Math.floor(Math.abs(maxNegativeOffset)) + 2,
        poolTopBaseY,
        poolVerticalGap,
        rowGap,
      },
    }
  }, [matches, teams, pools])

  useEffect(() => {
    if (!graphRef.current) return

    const timer = setTimeout(() => {
      try {
        graphRef.current.zoomToFit(400, 220)
      } catch {
        // ignore
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [graphData, graphSize])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="text-3xl font-bold">Visual Graph</h1>
        <p className="mt-2 text-gray-600">
          All pool leaders share the same x baseline. Teams further left are weaker relative to the
          leader in that pool. Lower down means lower rank in that pool.
        </p>

        <div className="mt-6 max-w-xs">
          <label className="mb-2 block text-sm font-medium">Season</label>
          <input
            type="number"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>

        {loading && <p className="mt-6">Loading visual graph...</p>}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && graphData.nodes.length === 0 && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            No connected matches found for this season.
          </div>
        )}

        {!loading && !error && graphData.nodes.length > 0 && (
          <>
            <div className="mt-8 rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-700">
                <div>
                  <strong>Pools:</strong> {pools.length}
                </div>
                <div>
                  <strong>Teams in graph:</strong> {graphData.nodes.length}
                </div>
                <div>
                  <strong>Matches:</strong> {graphData.links.length}
                </div>
              </div>

              <div
                ref={containerRef}
                className="h-[820px] w-full overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  width={graphSize.width}
                  height={graphSize.height}
                  cooldownTicks={0}
                  enableNodeDrag={false}
                  nodeRelSize={6}
                  linkColor={(link: any) => getPoolColor(link.poolId)}
                  linkWidth={2}
                  linkDirectionalParticles={0}
                  nodeLabel={(node: any) =>
                    `${node.name} | Pool ${node.poolId} | Score ${node.relativeScore > 0 ? '+' : ''}${node.relativeScore} | Rank ${node.rankPosition}`
                  }
                  linkLabel={(link: any) => link.label}
                  nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = `${node.rankPosition}. ${node.name}`
                    const fontSize = 12 / globalScale
                    ctx.font = `${fontSize}px Sans-Serif`

                    const color = getPoolColor(node.poolId)

                    ctx.beginPath()
                    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false)
                    ctx.fillStyle = color
                    ctx.fill()

                    ctx.strokeStyle = '#111827'
                    ctx.lineWidth = 1
                    ctx.stroke()

                    const neighbourXs = graphData.neighbourXMap.get(String(node.id)) || []
                    const averageNeighbourX =
                      neighbourXs.length > 0
                        ? neighbourXs.reduce((sum, x) => sum + x, 0) / neighbourXs.length
                        : (node.x || 0) - 1

                    let placeLabelLeft = averageNeighbourX > (node.x || 0)

                    const textWidth = ctx.measureText(label).width
                    const gap = node.val + 4
                    const canvasWidth = ctx.canvas.width
                    const rightMargin = 20
                    const leftMargin = 20

                    const rightEdge = (node.x || 0) + gap + textWidth
                    const leftEdge = (node.x || 0) - gap - textWidth

                    if (rightEdge > canvasWidth - rightMargin) {
                      placeLabelLeft = true
                    }

                    if (leftEdge < leftMargin) {
                      placeLabelLeft = false
                    }

                    ctx.fillStyle = '#111827'

                    if (placeLabelLeft) {
                      ctx.fillText(label, (node.x || 0) - gap - textWidth, (node.y || 0) + 4)
                    } else {
                      ctx.fillText(label, (node.x || 0) + gap, (node.y || 0) + 4)
                    }
                  }}
                  linkCanvasObjectMode={() => 'after'}
                  linkCanvasObject={(link: any, ctx, globalScale) => {
                    const start = link.source
                    const end = link.target
                    if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return

                    ctx.strokeStyle = getPoolColor(link.poolId)
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.moveTo(start.x, start.y)
                    ctx.lineTo(end.x, end.y)
                    ctx.stroke()

                    const midX = (start.x + end.x) / 2
                    const midY = (start.y + end.y) / 2

                    const dx = end.x - start.x
                    const dy = end.y - start.y
                    const length = Math.sqrt(dx * dx + dy * dy) || 1

                    const normalX = -dy / length
                    const normalY = dx / length
                    const offsetDistance = 14

                    const labelX = midX + normalX * offsetDistance
                    const labelY = midY + normalY * offsetDistance

                    const marginText = `${link.margin > 0 ? '+' : ''}${link.margin}`
                    const fontSize = 11 / globalScale
                    ctx.font = `${fontSize}px Sans-Serif`

                    const textWidth = ctx.measureText(marginText).width
                    const padding = 4

                    ctx.fillStyle = 'rgba(255,255,255,0.92)'
                    ctx.fillRect(
                      labelX - textWidth / 2 - padding,
                      labelY - fontSize,
                      textWidth + padding * 2,
                      fontSize + padding * 2
                    )

                    ctx.strokeStyle = '#d1d5db'
                    ctx.lineWidth = 0.5
                    ctx.strokeRect(
                      labelX - textWidth / 2 - padding,
                      labelY - fontSize,
                      textWidth + padding * 2,
                      fontSize + padding * 2
                    )

                    ctx.fillStyle = '#111827'
                    ctx.fillText(marginText, labelX - textWidth / 2, labelY + 2)
                  }}
                  onRenderFramePost={(ctx) => {
                    const {
                      xLeaderBaseline,
                      xPixelsPerMargin,
                      maxLeftMargin,
                      poolTopBaseY,
                      poolVerticalGap,
                      rowGap,
                    } = graphData.axis

                    const width = ctx.canvas.width
                    const height = ctx.canvas.height

                    ctx.save()

                    ctx.strokeStyle = '#9ca3af'
                    ctx.lineWidth = 1
                    ctx.setLineDash([6, 6])
                    ctx.beginPath()
                    ctx.moveTo(xLeaderBaseline, 40)
                    ctx.lineTo(xLeaderBaseline, height - 40)
                    ctx.stroke()
                    ctx.setLineDash([])

                    ctx.fillStyle = '#374151'
                    ctx.font = '12px Sans-Serif'
                    ctx.fillText('Leader baseline (0)', xLeaderBaseline + 6, 32)

                    for (let m = 0; m <= maxLeftMargin; m += 2) {
                      const x = xLeaderBaseline - m * xPixelsPerMargin

                      ctx.strokeStyle = '#d1d5db'
                      ctx.beginPath()
                      ctx.moveTo(x, 40)
                      ctx.lineTo(x, height - 40)
                      ctx.stroke()

                      ctx.fillStyle = '#6b7280'
                      ctx.fillText(`${-m}`, x - 8, height - 18)
                    }

                    pools.forEach((pool) => {
                      const topY = poolTopBaseY + (pool.poolId - 1) * poolVerticalGap

                      ctx.strokeStyle = '#e5e7eb'
                      ctx.beginPath()
                      ctx.moveTo(40, topY)
                      ctx.lineTo(width - 40, topY)
                      ctx.stroke()

                      ctx.fillStyle = getPoolColor(pool.poolId)
                      ctx.font = '12px Sans-Serif'
                      ctx.fillText(`Pool ${pool.poolId} leader`, 50, topY - 8)

                      pool.rankings.forEach((_, index) => {
                        const rankY = topY + index * rowGap
                        ctx.fillStyle = '#6b7280'
                        ctx.fillText(`${index + 1}`, 18, rankY + 4)
                      })
                    })

                    ctx.fillStyle = '#111827'
                    ctx.font = '13px Sans-Serif'
                    ctx.fillText('Relative margin from pool leader', width / 2 - 80, height - 4)

                    ctx.save()
                    ctx.translate(12, height / 2 + 80)
                    ctx.rotate(-Math.PI / 2)
                    ctx.fillText('Rank in pool', 0, 0)
                    ctx.restore()

                    ctx.restore()
                  }}
                  onNodeClick={(node: any) => {
                    setSelectedInfo(
                      `Team: ${node.name} | Pool: ${node.poolId} | Relative score: ${node.relativeScore > 0 ? '+' : ''}${node.relativeScore} | Rank in pool: ${node.rankPosition}`
                    )
                  }}
                  onLinkClick={(link: any) => {
                    setSelectedInfo(`Match: ${link.label}`)
                  }}
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">How to read this graph</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p>• All pool leaders share the same global x baseline at 0</p>
                <p>• Teams further left are weaker relative to the leader in that pool</p>
                <p>• Rank 1 is at the top of each pool, then rank 2, rank 3, and so on lower down</p>
                <p>• All match links have the same thickness</p>
                <p>• Margin labels are offset slightly above each connecting line</p>
                <p>• Team names move left or right depending on where the node sits in the line</p>
                <p>• Far-right labels automatically flip left if they would be cut off</p>
                <p>• Vertical tick lines show margin difference from the pool leader</p>
                <p>• Rank markers on the left show the y-axis ranking levels</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Selected Item</h2>
              <p className="mt-2 text-gray-700">
                {selectedInfo || 'Click a team or a match in the graph.'}
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
