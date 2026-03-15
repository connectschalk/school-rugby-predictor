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

function getBaselineLayoutData(
    matches: Match[],
    baselineTeamId: number,
    maxDepth: number
) {
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

    // direct opponents of the baseline must always be depth 1
    const directOpponents = new Set<number>()

    for (const match of matches) {
        if (match.team_a_id === baselineTeamId) {
            directOpponents.add(match.team_b_id)
        } else if (match.team_b_id === baselineTeamId) {
            directOpponents.add(match.team_a_id)
        }
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
            if (!visited.has(neighbour.opponentId)) {
                visited.add(neighbour.opponentId)

                let nextDepth = current.depth + 1

                // force all direct baseline opponents onto depth 1
                if (directOpponents.has(neighbour.opponentId)) {
                    nextDepth = 1
                }

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
    }

    return {
        reachableTeamIds: visited,
        depthMap,
        marginMap,
        parentMap,
        matchMap,
    }
}

export default function NetworkPage() {
    const [teams, setTeams] = useState<Team[]>([])
    const [matches, setMatches] = useState<Match[]>([])
    const [season, setSeason] = useState('2026')
    const [baselineTeam, setBaselineTeam] = useState('')
    const [depth, setDepth] = useState('2')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedInfo, setSelectedInfo] = useState('')
    const [graphSize, setGraphSize] = useState({ width: 1800, height: 900 })

    const graphRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        function updateSize() {
            const width = containerRef.current?.clientWidth || 1800
            setGraphSize({ width, height: 900 })
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

        return getBaselineLayoutData(matches, Number(baselineTeam), Number(depth))
    }, [matches, baselineTeam, depth])

    const filteredMatches = useMemo(() => {
        if (!baselineTeam) return matches

        return matches.filter(
            (m) =>
                baselineReachability.reachableTeamIds.has(m.team_a_id) &&
                baselineReachability.reachableTeamIds.has(m.team_b_id)
        )
    }, [matches, baselineTeam, baselineReachability])

    const graphData = useMemo(() => {
        const baselineId = baselineTeam ? Number(baselineTeam) : null

        const teamIdsInMatches = new Set<number>()
        filteredMatches.forEach((m) => {
            teamIdsInMatches.add(m.team_a_id)
            teamIdsInMatches.add(m.team_b_id)
        })

        const xLeaderBaseline = 900
        const xPixelsPerMargin = 10
        const baselineY = 220
        const depthRowGap = 160

        const nodes: GraphNode[] = [...teamIdsInMatches].map((teamId) => {
            const team = teams.find((t) => t.id === teamId)

            const depthLevel = baselineId
                ? baselineReachability.depthMap.get(teamId) ?? 0
                : 0

            const cumulativeMargin = baselineId
                ? baselineReachability.marginMap.get(teamId) ?? 0
                : 0

            const matchesPlayed = filteredMatches.filter(
                (m) => m.team_a_id === teamId || m.team_b_id === teamId
            ).length

            const fixedX = xLeaderBaseline + cumulativeMargin * xPixelsPerMargin
            const fixedY = baselineY + depthLevel * depthRowGap

            return {
                id: String(teamId),
                name: team?.name || `Team ${teamId}`,
                val: Math.max(7, matchesPlayed * 2),
                poolId: 1,
                relativeScore: cumulativeMargin,
                rankPosition: depthLevel,
                x: fixedX,
                y: fixedY,
                fx: fixedX,
                fy: fixedY,
            }
        })

        const links: GraphLink[] = filteredMatches.map((match) => {
            const margin = match.team_a_score - match.team_b_score
            const teamA = teams.find((t) => t.id === match.team_a_id)?.name || `Team ${match.team_a_id}`
            const teamB = teams.find((t) => t.id === match.team_b_id)?.name || `Team ${match.team_b_id}`

            return {
                source: String(match.team_a_id),
                target: String(match.team_b_id),
                label: `${teamA} ${match.team_a_score} - ${match.team_b_score} ${teamB} | margin ${margin > 0 ? '+' : ''
                    }${margin}`,
                matchId: match.id,
                poolId: 1,
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

        const allMargins = nodes.map((n) => n.relativeScore)
        const minMargin = allMargins.length ? Math.min(...allMargins) : 0
        const maxMargin = allMargins.length ? Math.max(...allMargins) : 0

        return {
            nodes,
            links,
            neighbourXMap,
            axis: {
                xLeaderBaseline,
                xPixelsPerMargin,
                minMargin,
                maxMargin,
                baselineY,
                depthRowGap,
            },
        }
    }, [filteredMatches, teams, baselineTeam, baselineReachability])

    useEffect(() => {
        if (!graphRef.current || graphData.nodes.length === 0) return

        const runFit = () => {
            try {
                graphRef.current.zoomToFit(800, 120)
            } catch {
                // ignore
            }
        }

        const t1 = setTimeout(runFit, 150)
        const t2 = setTimeout(runFit, 500)
        const t3 = setTimeout(runFit, 1000)

        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
            clearTimeout(t3)
        }
    }, [graphData, graphSize])

    return (
        <main className="min-h-screen bg-white text-black">
            <div className="mx-auto max-w-7xl px-6 py-12">
                <h1 className="text-3xl font-bold">Visual Graph</h1>
                <p className="mt-2 text-gray-600">
                    Choose a baseline team. Direct opponents stay on the same horizontal level as the baseline,
                    while deeper linked teams appear on lower levels. Horizontal position reflects cumulative
                    margin relative to the selected baseline.
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
                        <label className="mb-2 block text-sm font-medium">Depth</label>
                        <select
                            value={depth}
                            onChange={(e) => setDepth(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                        </select>
                    </div>
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
                                    <strong>Teams in graph:</strong> {graphData.nodes.length}
                                </div>
                                <div>
                                    <strong>Matches:</strong> {graphData.links.length}
                                </div>
                            </div>

                            <div
                                ref={containerRef}
                                className="h-[900px] w-full overflow-auto rounded-xl border border-gray-200 bg-white"
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
                                    onEngineStop={() => {
                                        try {
                                            graphRef.current?.zoomToFit(800, 120)
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                    nodeLabel={(node: any) =>
                                        `${node.name} | Depth ${node.rankPosition} | Margin ${node.relativeScore > 0 ? '+' : ''
                                        }${node.relativeScore}`
                                    }
                                    linkLabel={(link: any) => link.label}
                                    nodeCanvasObject={(node: any, ctx, globalScale) => {
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

                                        const currentDepth = baselineTeam
                                            ? baselineReachability.depthMap.get(Number(node.id)) ?? 0
                                            : 0

                                        const label = node.name
                                        ctx.fillStyle = '#111827'

                                        if (currentDepth === 0 || currentDepth === 1) {
                                            ctx.textAlign = 'center'
                                            ctx.textBaseline = 'bottom'

                                            const labelY = (node.y || 0) - (node.val + 18)
                                            const textWidth = ctx.measureText(label).width
                                            const paddingX = 6
                                            const paddingY = 4

                                            ctx.fillStyle = 'rgba(255,255,255,0.95)'
                                            ctx.fillRect(
                                                (node.x || 0) - textWidth / 2 - paddingX,
                                                labelY - fontSize - paddingY,
                                                textWidth + paddingX * 2,
                                                fontSize + paddingY * 2
                                            )

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.lineWidth = 0.5
                                            ctx.strokeRect(
                                                (node.x || 0) - textWidth / 2 - paddingX,
                                                labelY - fontSize - paddingY,
                                                textWidth + paddingX * 2,
                                                fontSize + paddingY * 2
                                            )

                                            ctx.fillStyle = '#111827'
                                            ctx.fillText(label, node.x || 0, labelY)
                                        } else {
                                            const neighbourXs = graphData.neighbourXMap.get(String(node.id)) || []
                                            let placeLabelLeft = false

                                            if (neighbourXs.length > 0) {
                                                const rightNeighbours = neighbourXs.filter((x) => x > (node.x || 0)).length
                                                const leftNeighbours = neighbourXs.filter((x) => x < (node.x || 0)).length
                                                placeLabelLeft = rightNeighbours > leftNeighbours
                                            }

                                            const gap = node.val + 12
                                            ctx.textAlign = placeLabelLeft ? 'right' : 'left'
                                            ctx.textBaseline = 'middle'

                                            if (placeLabelLeft) {
                                                ctx.fillText(label, (node.x || 0) - gap, node.y || 0)
                                            } else {
                                                ctx.fillText(label, (node.x || 0) + gap, node.y || 0)
                                            }
                                        }
                                    }}
                                    linkCanvasObjectMode={() => 'after'}
                                    linkCanvasObject={(link: any, ctx, globalScale) => {
                                        const start = link.source
                                        const end = link.target
                                        if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return

                                        const dx = end.x - start.x
                                        const dy = end.y - start.y
                                        const length = Math.sqrt(dx * dx + dy * dy) || 1

                                        const offsetStartX = start.x + (dx / length) * start.val
                                        const offsetStartY = start.y + (dy / length) * start.val
                                        const offsetEndX = end.x - (dx / length) * end.val
                                        const offsetEndY = end.y - (dy / length) * end.val

                                        ctx.strokeStyle = getPoolColor(link.poolId)
                                        ctx.lineWidth = 2
                                        ctx.beginPath()
                                        ctx.moveTo(offsetStartX, offsetStartY)
                                        ctx.lineTo(offsetEndX, offsetEndY)
                                        ctx.stroke()

                                        const midX = (offsetStartX + offsetEndX) / 2
                                        const midY = (offsetStartY + offsetEndY) / 2

                                        const normalX = -dy / length
                                        const normalY = dx / length
                                        const offsetDistance = 14

                                        const labelX = midX + normalX * offsetDistance
                                        const labelY = midY + normalY * offsetDistance

                                        const marginText = `${link.margin > 0 ? '+' : ''}${link.margin}`
                                        const labelFontSize = 11 / globalScale
                                        ctx.font = `${labelFontSize}px Sans-Serif`

                                        const textWidth = ctx.measureText(marginText).width
                                        const padding = 4

                                        ctx.fillStyle = 'rgba(255,255,255,0.92)'
                                        ctx.fillRect(
                                            labelX - textWidth / 2 - padding,
                                            labelY - labelFontSize,
                                            textWidth + padding * 2,
                                            labelFontSize + padding * 2
                                        )

                                        ctx.strokeStyle = '#d1d5db'
                                        ctx.lineWidth = 0.5
                                        ctx.strokeRect(
                                            labelX - textWidth / 2 - padding,
                                            labelY - labelFontSize,
                                            textWidth + padding * 2,
                                            labelFontSize + padding * 2
                                        )

                                        ctx.fillStyle = '#111827'
                                        ctx.textAlign = 'left'
                                        ctx.textBaseline = 'alphabetic'
                                        ctx.fillText(marginText, labelX - textWidth / 2, labelY + 2)
                                    }}
                                    onRenderFramePost={(ctx) => {
                                        const {
                                            xLeaderBaseline,
                                            xPixelsPerMargin,
                                            minMargin,
                                            maxMargin,
                                            baselineY,
                                            depthRowGap,
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
                                        ctx.fillText('Baseline (0)', xLeaderBaseline + 6, 32)

                                        for (
                                            let m = Math.floor(minMargin / 10) * 10;
                                            m <= Math.ceil(maxMargin / 10) * 10;
                                            m += 10
                                        ) {
                                            const x = xLeaderBaseline + m * xPixelsPerMargin

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.beginPath()
                                            ctx.moveTo(x, 40)
                                            ctx.lineTo(x, height - 40)
                                            ctx.stroke()

                                            ctx.fillStyle = '#6b7280'
                                            ctx.fillText(`${m}`, x - 8, height - 18)
                                        }

                                        for (let d = 0; d <= Number(depth); d++) {
                                            const y = baselineY + d * depthRowGap

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.beginPath()
                                            ctx.moveTo(40, y)
                                            ctx.lineTo(width - 40, y)
                                            ctx.stroke()

                                            ctx.fillStyle = '#6b7280'
                                            ctx.font = '12px Sans-Serif'

                                            if (d === 0) {
                                                ctx.fillText('Baseline + direct opponents', 50, y - 18)
                                            } else {
                                                ctx.fillText(`Depth ${d}`, 50, y - 18)
                                            }
                                        }

                                        ctx.fillStyle = '#111827'
                                        ctx.font = '13px Sans-Serif'
                                        ctx.fillText('Margin relative to selected baseline', width / 2 - 90, height - 4)

                                        ctx.save()
                                        ctx.translate(12, height / 2 + 80)
                                        ctx.rotate(-Math.PI / 2)
                                        ctx.fillText('Linked depth', 0, 0)
                                        ctx.restore()

                                        ctx.restore()
                                    }}
                                    onNodeClick={(node: any) => {
                                        setSelectedInfo(
                                            `Team: ${node.name} | Depth: ${node.rankPosition} | Margin from baseline: ${node.relativeScore > 0 ? '+' : ''
                                            }${node.relativeScore}`
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
                                <p>- Baseline team and direct opponents stay on the same horizontal line</p>
                                <p>- Deeper linked teams appear on lower rows</p>
                                <p>- Horizontal position reflects cumulative margin from the selected baseline</p>
                                <p>- Margin labels are shown on the connecting lines</p>
                                <p>- Baseline row labels appear above the nodes for readability</p>
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