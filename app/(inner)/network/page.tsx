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
    logo?: string
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
    depth?: number
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

function getBaselineColor() {
    return '#111827'
}

function getDepthLinkColor(depth: number) {
    if (depth <= 1) return '#2563eb'
    return '#0f766e'
}

function slugifyTeamName(name: string) {
    return name
        .toLowerCase()
        .trim()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
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
    const [depth, setDepth] = useState('3')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedInfo, setSelectedInfo] = useState('')
    const [graphSize, setGraphSize] = useState({ width: 1800, height: 900 })

    const graphRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const imageCacheRef = useRef<Record<string, HTMLImageElement>>({})

    function getNodeImage(src: string) {
        if (!imageCacheRef.current[src]) {
            const img = new Image()

            img.onload = () => {
                try {
                    graphRef.current?.refresh()
                } catch {
                    // ignore if refresh not available
                }
            }

            img.onerror = () => {
                console.warn("Logo failed to load:", src)
            }

            img.src = src
            imageCacheRef.current[src] = img
        }

        return imageCacheRef.current[src]
    }

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

            const loadedTeams = (data as Team[]) || []
            setTeams(loadedTeams)

            const greyCollege = loadedTeams.find(
                (team) => team.name.trim().toLowerCase() === 'grey college'
            )

            if (greyCollege) {
                setBaselineTeam(String(greyCollege.id))
            }
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
            const fixedY =
                depthLevel <= 1
                    ? baselineY
                    : baselineY + (depthLevel - 1) * depthRowGap

            return {
                id: String(teamId),
                name: team?.name || `Team ${teamId}`,
                logo: `/team-logos/${slugifyTeamName(team?.name || `team-${teamId}`)}.png`,
                val: 18,
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

            const depthA = baselineId
                ? baselineReachability.depthMap.get(match.team_a_id) ?? 0
                : 0

            const depthB = baselineId
                ? baselineReachability.depthMap.get(match.team_b_id) ?? 0
                : 0

            const linkDepth = Math.max(depthA, depthB)

            return {
                source: String(match.team_a_id),
                target: String(match.team_b_id),
                label: `${teamA} ${match.team_a_score} - ${match.team_b_score} ${teamB} | margin ${margin > 0 ? '+' : ''}${margin}`,
                matchId: match.id,
                poolId: 1,
                margin,
                depth: linkDepth,
            } as GraphLink & { depth: number }
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

        const runPosition = () => {
            try {
                const baselineId = baselineTeam ? String(baselineTeam) : null
                const baselineNode = baselineId
                    ? graphData.nodes.find((node) => node.id === baselineId)
                    : null

                if (!baselineNode) {
                    graphRef.current.zoomToFit(800, 120)
                    return
                }

                graphRef.current.zoomToFit(800, 120)

                const zoomLevel = 0.95
                graphRef.current.zoom(zoomLevel, 0)

                const offsetX = (graphSize.width * 0.30) / zoomLevel
                const offsetY = (graphSize.height * 0.16) / zoomLevel

                graphRef.current.centerAt(
                    (baselineNode.x || 0) - offsetX,
                    (baselineNode.y || 0) + offsetY,
                    0
                )
            } catch {
                // ignore
            }
        }

        const t1 = setTimeout(runPosition, 200)
        const t2 = setTimeout(runPosition, 600)
        const t3 = setTimeout(runPosition, 1200)

        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
            clearTimeout(t3)
        }
    }, [graphData, graphSize, baselineTeam])

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
                            <div className="mb-4 flex flex-wrap items-center gap-6 text-sm text-gray-700">
                                <div>
                                    <strong>Teams in graph:</strong> {graphData.nodes.length}
                                </div>
                                <div>
                                    <strong>Matches:</strong> {graphData.links.length}
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-3 w-3 rounded-full bg-[#111827]" />
                                    <span>Baseline team</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-[2px] w-6 bg-[#2563eb]" />
                                    <span>Baseline / direct links</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-[2px] w-6 bg-[#0f766e]" />
                                    <span>Depth 2 and 3 links</span>
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
                                    nodeRelSize={0}
                                    linkColor={(link: any) => getDepthLinkColor(link.depth ?? 1)}
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

                                        const imageSize = 42
                                        const logoSrc = node.logo as string | undefined
                                        const isBaselineNode = String(node.id) === String(baselineTeam)

                                        const drawFallbackNode = () => {
                                            ctx.beginPath()
                                            ctx.arc(node.x || 0, node.y || 0, 12, 0, 2 * Math.PI, false)
                                            ctx.fillStyle = isBaselineNode ? getBaselineColor() : getPoolColor(node.poolId)
                                            ctx.fill()

                                            ctx.strokeStyle = '#ffffff'
                                            ctx.lineWidth = 1.5
                                            ctx.stroke()

                                            if (isBaselineNode) {
                                                ctx.beginPath()
                                                ctx.arc(node.x || 0, node.y || 0, 17, 0, 2 * Math.PI, false)
                                                ctx.strokeStyle = getBaselineColor()
                                                ctx.lineWidth = 3
                                                ctx.stroke()
                                            }
                                        }

                                        if (logoSrc) {
                                            const img = getNodeImage(logoSrc)

                                            if (img.complete && img.naturalWidth > 0) {
                                                ctx.drawImage(
                                                    img,
                                                    (node.x || 0) - imageSize / 2,
                                                    (node.y || 0) - imageSize / 2,
                                                    imageSize,
                                                    imageSize
                                                )

                                                if (isBaselineNode) {
                                                    ctx.beginPath()
                                                    ctx.arc(node.x || 0, node.y || 0, imageSize / 2 + 5, 0, 2 * Math.PI, false)
                                                    ctx.strokeStyle = getBaselineColor()
                                                    ctx.lineWidth = 3
                                                    ctx.stroke()
                                                }
                                            } else {
                                                drawFallbackNode()
                                            }
                                        } else {
                                            drawFallbackNode()
                                        }

                                        const currentDepth = baselineTeam
                                            ? baselineReachability.depthMap.get(Number(node.id)) ?? 0
                                            : 0

                                        const label = node.name
                                        ctx.fillStyle = '#111827'

                                        if (currentDepth === 0 || currentDepth === 1) {
                                            ctx.textAlign = 'center'
                                            ctx.textBaseline = 'bottom'

                                            const shortLabel =
                                                label.length > 14
                                                    ? label.split(' ').slice(0, 2).join(' ')
                                                    : label

                                            const nodeIndex = Number(node.id) || 0
                                            const staggerOffset = nodeIndex % 2 === 0 ? 28 : 44
                                            const labelY = (node.y || 0) - staggerOffset

                                            const textWidth = ctx.measureText(shortLabel).width
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
                                            ctx.fillText(shortLabel, node.x || 0, labelY)
                                        } else {
                                            const shortLabel =
                                                label.length > 14
                                                    ? label.split(' ').slice(0, 2).join(' ')
                                                    : label

                                            const neighbourXs = graphData.neighbourXMap.get(String(node.id)) || []
                                            let placeLabelLeft = false

                                            if (neighbourXs.length > 0) {
                                                const rightNeighbours = neighbourXs.filter((x) => x > (node.x || 0)).length
                                                const leftNeighbours = neighbourXs.filter((x) => x < (node.x || 0)).length
                                                placeLabelLeft = rightNeighbours > leftNeighbours
                                            }

                                            const nodeIndex = Number(node.id) || 0
                                            const verticalOffset = nodeIndex % 2 === 0 ? -14 : 14
                                            const horizontalGap = 18

                                            const labelX = placeLabelLeft
                                                ? (node.x || 0) - horizontalGap
                                                : (node.x || 0) + horizontalGap

                                            const labelY = (node.y || 0) + verticalOffset

                                            ctx.textAlign = placeLabelLeft ? 'right' : 'left'
                                            ctx.textBaseline = 'middle'

                                            const textWidth = ctx.measureText(shortLabel).width
                                            const paddingX = 5
                                            const paddingY = 3

                                            const boxX = placeLabelLeft
                                                ? labelX - textWidth - paddingX
                                                : labelX - paddingX

                                            const boxY = labelY - fontSize / 2 - paddingY

                                            ctx.fillStyle = 'rgba(255,255,255,0.96)'
                                            ctx.fillRect(
                                                boxX,
                                                boxY,
                                                textWidth + paddingX * 2,
                                                fontSize + paddingY * 2
                                            )

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.lineWidth = 0.5
                                            ctx.strokeRect(
                                                boxX,
                                                boxY,
                                                textWidth + paddingX * 2,
                                                fontSize + paddingY * 2
                                            )

                                            ctx.fillStyle = '#111827'
                                            ctx.fillText(shortLabel, labelX, labelY)
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

                                        const startRadius = 17
                                        const endRadius = 17

                                        const offsetStartX = start.x + (dx / length) * startRadius
                                        const offsetStartY = start.y + (dy / length) * startRadius
                                        const offsetEndX = end.x - (dx / length) * endRadius
                                        const offsetEndY = end.y - (dy / length) * endRadius

                                        // 🔵 Draw the link line
                                        ctx.strokeStyle = getDepthLinkColor(link.depth ?? 1)
                                        ctx.lineWidth = 2
                                        ctx.beginPath()
                                        ctx.moveTo(offsetStartX, offsetStartY)
                                        ctx.lineTo(offsetEndX, offsetEndY)
                                        ctx.stroke()

                                        // 🔴 STOP HERE if zoomed out → removes clutter
                                        if (globalScale < 1.2) return

                                        // 🔴 OPTIONAL: hide tiny margins
                                        if (Math.abs(link.margin) < 10) return

                                        // 🟢 Draw label ONLY when zoomed in
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
                                    onRenderFramePre={(ctx) => {
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

                                        const nodeXs = graphData.nodes.map((n: any) => n.x || 0)
                                        const leftMostNodeX = nodeXs.length ? Math.min(...nodeXs) : 100
                                        const yTopAxis = 70
                                        const xLeftAxis = leftMostNodeX - 70

                                        ctx.save()

                                        // Top horizontal axis
                                        ctx.strokeStyle = '#9ca3af'
                                        ctx.lineWidth = 1.2
                                        ctx.beginPath()
                                        ctx.moveTo(xLeftAxis, yTopAxis)
                                        ctx.lineTo(width - 40, yTopAxis)
                                        ctx.stroke()

                                        // Left vertical axis
                                        ctx.beginPath()
                                        ctx.moveTo(xLeftAxis, yTopAxis)
                                        ctx.lineTo(xLeftAxis, height - 40)
                                        ctx.stroke()

                                        // Margin ticks and labels across the top
                                        ctx.fillStyle = '#6b7280'
                                        ctx.font = '12px Sans-Serif'
                                        ctx.textAlign = 'center'

                                        for (
                                            let m = Math.floor(minMargin / 10) * 10;
                                            m <= Math.ceil(maxMargin / 10) * 10;
                                            m += 10
                                        ) {
                                            const x = xLeaderBaseline + m * xPixelsPerMargin

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.beginPath()
                                            ctx.moveTo(x, yTopAxis)
                                            ctx.lineTo(x, height - 40)
                                            ctx.stroke()

                                            ctx.strokeStyle = '#9ca3af'
                                            ctx.beginPath()
                                            ctx.moveTo(x, yTopAxis - 6)
                                            ctx.lineTo(x, yTopAxis + 6)
                                            ctx.stroke()

                                            ctx.fillStyle = '#6b7280'
                                            ctx.fillText(`${m}`, x, yTopAxis - 12)
                                        }

                                        // Horizontal depth guide lines
                                        for (let d = 0; d <= Number(depth); d++) {
                                            const y =
                                                d <= 1
                                                    ? baselineY
                                                    : baselineY + (d - 1) * depthRowGap

                                            ctx.strokeStyle = '#e5e7eb'
                                            ctx.beginPath()
                                            ctx.moveTo(xLeftAxis, y)
                                            ctx.lineTo(width - 40, y)
                                            ctx.stroke()
                                        }

                                        // Row labels
                                        ctx.fillStyle = '#6b7280'
                                        ctx.font = '12px Sans-Serif'
                                        ctx.textAlign = 'center'


                                        ctx.textAlign = 'left'
                                        for (let d = 2; d <= Number(depth); d++) {
                                            const y = baselineY + (d - 1) * depthRowGap
                                            ctx.fillText(`Depth ${d}`, xLeftAxis + 12, y - 18)
                                        }

                                        // Axis titles
                                        ctx.fillStyle = '#111827'
                                        ctx.font = '13px Sans-Serif'
                                        ctx.textAlign = 'center'
                                        ctx.fillText('Point margin relative to baseline', width / 2, 28)

                                        ctx.save()
                                        ctx.translate(xLeftAxis - 40, height / 2 + 60)
                                        ctx.rotate(-Math.PI / 2)
                                        ctx.fillText('Linked depth', 0, 0)
                                        ctx.restore()

                                        // Baseline marker on top axis
                                        ctx.strokeStyle = '#111827'
                                        ctx.setLineDash([6, 6])
                                        ctx.beginPath()
                                        ctx.moveTo(xLeaderBaseline, yTopAxis)
                                        ctx.lineTo(xLeaderBaseline, height - 40)
                                        ctx.stroke()
                                        ctx.setLineDash([])

                                        ctx.fillStyle = '#374151'
                                        ctx.font = '12px Sans-Serif'
                                        ctx.textAlign = 'center'
                                        ctx.fillText('Baseline (0)', xLeaderBaseline, yTopAxis + 20)

                                        ctx.textAlign = 'left'
                                        ctx.fillStyle = '#4b5563'
                                        ctx.font = '11px Sans-Serif'
                                        ctx.fillText('Baseline +', xLeaderBaseline + 34, baselineY - 14)
                                        ctx.fillText('direct opponents', xLeaderBaseline + 34, baselineY + 2)

                                        ctx.textAlign = 'left'


                                        ctx.restore()
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
                                <p>- Team nodes use PNG logos when matching files exist in public/team-logos</p>
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