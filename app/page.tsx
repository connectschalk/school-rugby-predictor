'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type Edge = {
  from: string
  to: string
  margin: number
  matchId: number
}

type PathResult = {
  totalMargin: number
  path: Edge[]
  weight: number
  baselineCount: number
  consistencyScore: number
}

type PredictionResult = {
  type: 'direct' | 'indirect'
  averageMargin: number
  pathCount: number
  confidence: string
  paths: PathResult[]
  directMatch?: Match
  relevantMatches: Match[]
}

const MAX_LINKS = 5

const BASELINE_TEAMS = new Set([
  'Afrikaans Hoër Seuns',
  'Grey College',
  'Paarl Gimnasium',
  'Paarl Boys High',
  'Oakdale',
  'Outeniqua',
  'Durban High',
])

function buildGraph(matches: Match[]) {
  const graph: Record<string, Edge[]> = {}

  for (const match of matches) {
    const a = String(match.team_a_id)
    const b = String(match.team_b_id)
    const margin = match.team_a_score - match.team_b_score

    if (!graph[a]) graph[a] = []
    if (!graph[b]) graph[b] = []

    graph[a].push({ from: a, to: b, margin, matchId: match.id })
    graph[b].push({ from: b, to: a, margin: -margin, matchId: match.id })
  }

  return graph
}

function getTeamName(teams: Team[], id: string) {
  return teams.find((t) => String(t.id) === id)?.name || 'Unknown team'
}

function calculateTeamConsistency(matches: Match[]) {
  const teamMargins: Record<string, number[]> = {}

  for (const match of matches) {
    const a = String(match.team_a_id)
    const b = String(match.team_b_id)
    const margin = match.team_a_score - match.team_b_score

    if (!teamMargins[a]) teamMargins[a] = []
    if (!teamMargins[b]) teamMargins[b] = []

    teamMargins[a].push(margin)
    teamMargins[b].push(-margin)
  }

  const consistencyMap: Record<string, number> = {}

  for (const teamId of Object.keys(teamMargins)) {
    const margins = teamMargins[teamId]

    if (margins.length <= 1) {
      consistencyMap[teamId] = 0.8
      continue
    }

    const mean = margins.reduce((sum, m) => sum + m, 0) / margins.length
    const variance =
      margins.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / margins.length
    const stdDev = Math.sqrt(variance)

    const score = Math.max(0.6, Math.min(1.2, 1.2 - stdDev / 40))
    consistencyMap[teamId] = Math.round(score * 1000) / 1000
  }

  return consistencyMap
}

function findAllPathsWithWeights(
  graph: Record<string, Edge[]>,
  start: string,
  end: string,
  maxDepth: number,
  teams: Team[],
  consistencyMap: Record<string, number>
): PathResult[] {
  const results: PathResult[] = []

  function dfs(
    current: string,
    target: string,
    depth: number,
    visited: Set<string>,
    totalMargin: number,
    path: Edge[]
  ) {
    if (depth > maxDepth) return

    if (current === target && path.length > 0) {
      const teamIdsInPath = new Set<string>()
      path.forEach((edge) => {
        teamIdsInPath.add(edge.from)
        teamIdsInPath.add(edge.to)
      })

      const namesInPath = [...teamIdsInPath].map((id) => getTeamName(teams, id))

      const baselineCount = namesInPath.filter((name) => BASELINE_TEAMS.has(name)).length

      const consistencyValues = [...teamIdsInPath]
        .filter((id) => id !== start && id !== end)
        .map((id) => consistencyMap[id] ?? 0.8)

      const avgConsistency =
        consistencyValues.length > 0
          ? consistencyValues.reduce((sum, v) => sum + v, 0) / consistencyValues.length
          : 1

      const lengthWeight = 1 / path.length
      const baselineBoost = 1 + baselineCount * 0.2
      const consistencyWeight = avgConsistency

      const weight = lengthWeight * baselineBoost * consistencyWeight

      results.push({
        totalMargin,
        path: [...path],
        weight,
        baselineCount,
        consistencyScore: Math.round(avgConsistency * 1000) / 1000,
      })
      return
    }

    const neighbours = graph[current] || []

    for (const edge of neighbours) {
      if (visited.has(edge.to)) continue

      visited.add(edge.to)
      path.push(edge)

      dfs(edge.to, target, depth + 1, visited, totalMargin + edge.margin, path)

      path.pop()
      visited.delete(edge.to)
    }
  }

  const visited = new Set<string>([start])
  dfs(start, end, 0, visited, 0, [])

  return results
}

function getConfidence(
  resultType: 'direct' | 'indirect',
  pathCount: number,
  totalWeight: number
) {
  if (resultType === 'direct') return 'High'
  if (pathCount >= 8 && totalWeight >= 4) return 'High'
  if (pathCount >= 3) return 'Medium'
  if (pathCount >= 1) return 'Low'
  return 'None'
}

function getMatchSummary(match: Match, fromId: string, teams: Team[]) {
  const teamAName = getTeamName(teams, String(match.team_a_id))
  const teamBName = getTeamName(teams, String(match.team_b_id))
  const marginFromAView = match.team_a_score - match.team_b_score

  if (String(match.team_a_id) === fromId) {
    if (marginFromAView > 0) {
      return `${teamAName} beat ${teamBName} by ${Math.abs(marginFromAView)}`
    }
    if (marginFromAView < 0) {
      return `${teamAName} lost to ${teamBName} by ${Math.abs(marginFromAView)}`
    }
    return `${teamAName} drew with ${teamBName}`
  }

  const reverseMargin = -marginFromAView
  if (reverseMargin > 0) {
    return `${teamBName} beat ${teamAName} by ${Math.abs(reverseMargin)}`
  }
  if (reverseMargin < 0) {
    return `${teamBName} lost to ${teamAName} by ${Math.abs(reverseMargin)}`
  }
  return `${teamBName} drew with ${teamAName}`
}

function formatFixture(match: Match, teams: Team[]) {
  const teamAName = getTeamName(teams, String(match.team_a_id))
  const teamBName = getTeamName(teams, String(match.team_b_id))
  return `${teamAName} ${match.team_a_score} - ${match.team_b_score} ${teamBName}`
}

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [season, setSeason] = useState('2026')
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PredictionResult | null>(null)

  useEffect(() => {
    async function loadTeams() {
      const { data } = await supabase
        .from('teams')
        .select('id, name')
        .order('name')

      setTeams((data as Team[]) || [])
    }

    loadTeams()
  }, [])

  useEffect(() => {
    async function loadMatches() {
      setLoading(true)
      setError('')
      setResult(null)

      const { data, error } = await supabase
        .from('matches')
        .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
        .eq('season', Number(season))
        .order('match_date', { ascending: false })

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

  const graph = useMemo(() => buildGraph(matches), [matches])

  const matchesById = useMemo(() => {
    const map: Record<number, Match> = {}
    for (const match of matches) {
      map[match.id] = match
    }
    return map
  }, [matches])

  const consistencyMap = useMemo(() => calculateTeamConsistency(matches), [matches])

  const homeTeamName = getTeamName(teams, homeTeam)
  const awayTeamName = getTeamName(teams, awayTeam)

  function runPrediction() {
    setError('')
    setResult(null)

    if (!homeTeam || !awayTeam) {
      setError('Please choose two teams.')
      return
    }

    if (homeTeam === awayTeam) {
      setError('Please choose two different teams.')
      return
    }

    const directMatch = matches.find(
      (m) =>
        (String(m.team_a_id) === homeTeam && String(m.team_b_id) === awayTeam) ||
        (String(m.team_a_id) === awayTeam && String(m.team_b_id) === homeTeam)
    )

    if (directMatch) {
      const margin =
        String(directMatch.team_a_id) === homeTeam
          ? directMatch.team_a_score - directMatch.team_b_score
          : directMatch.team_b_score - directMatch.team_a_score

      setResult({
        type: 'direct',
        averageMargin: margin,
        pathCount: 1,
        confidence: 'High',
        paths: [],
        directMatch,
        relevantMatches: [directMatch],
      })
      return
    }

    const allPaths = findAllPathsWithWeights(
      graph,
      homeTeam,
      awayTeam,
      MAX_LINKS,
      teams,
      consistencyMap
    )

    if (allPaths.length === 0) {
      setError('Not enough data.')
      return
    }

    const weightedTotal = allPaths.reduce((sum, p) => sum + p.totalMargin * p.weight, 0)
    const totalWeight = allPaths.reduce((sum, p) => sum + p.weight, 0)
    const weightedAverage = weightedTotal / totalWeight

    const sortedPaths = [...allPaths].sort((a, b) => b.weight - a.weight)
    const topPathsToShow = sortedPaths.slice(0, 10)

    const relevantMatchIds = Array.from(
      new Set(topPathsToShow.flatMap((path) => path.path.map((edge) => edge.matchId)))
    )

    const relevantMatches = relevantMatchIds
      .map((id) => matchesById[id])
      .filter(Boolean)

    setResult({
      type: 'indirect',
      averageMargin: Math.round(weightedAverage * 10) / 10,
      pathCount: allPaths.length,
      confidence: getConfidence('indirect', allPaths.length, totalWeight),
      paths: topPathsToShow,
      relevantMatches,
    })
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold">School Rugby Predictor</h1>
        <p className="mt-2 text-gray-600">
          Choose two teams and get a projected margin based on linked match results.
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

        <div className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
          {loading ? (
            <p>Loading teams and matches...</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Home Team</label>
                  <select
                    value={homeTeam}
                    onChange={(e) => setHomeTeam(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Home Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Away Team</label>
                  <select
                    value={awayTeam}
                    onChange={(e) => setAwayTeam(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Away Team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={runPrediction}
                className="mt-5 rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
              >
                Predict Margin
              </button>

              {error && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                  {error}
                </div>
              )}

              {result && (
                <div className="mt-6 space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                    <h2 className="text-xl font-semibold">
                      {result.type === 'direct' ? 'Direct Result Found' : 'Indirect Prediction'}
                    </h2>

                    <p className="mt-3 text-lg">
                      {result.averageMargin > 0
                        ? `${homeTeamName} by ${Math.abs(result.averageMargin)}`
                        : result.averageMargin < 0
                        ? `${awayTeamName} by ${Math.abs(result.averageMargin)}`
                        : 'Projected draw'}
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      Confidence: {result.confidence}
                    </p>

                    <p className="text-sm text-gray-600">
                      Links used: {result.pathCount}
                    </p>

                    {result.type === 'direct' && result.directMatch && (
                      <p className="text-sm text-gray-600">
                        Match date:{' '}
                        {new Date(result.directMatch.match_date).toLocaleDateString()}
                      </p>
                    )}

                    {result.type === 'indirect' && (
                      <p className="text-sm text-gray-600">
                        Based on {result.pathCount} total linked path(s), showing top 10 by weight
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold">Relevant Games</h3>

                    {result.relevantMatches.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-600">No relevant games found.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {result.relevantMatches.map((match) => (
                          <div
                            key={match.id}
                            className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700"
                          >
                            {formatFixture(match, teams)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {result.type === 'indirect' && (
                    <div className="rounded-2xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold">Motivation</h3>
                      <div className="mt-4 space-y-4">
                        {result.paths.map((pathResult, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-gray-200 bg-white p-4"
                          >
                            <p className="font-medium">
                              Path {index + 1}:{' '}
                              {pathResult.totalMargin > 0
                                ? `${homeTeamName} by ${Math.abs(pathResult.totalMargin)}`
                                : pathResult.totalMargin < 0
                                ? `${awayTeamName} by ${Math.abs(pathResult.totalMargin)}`
                                : 'Draw'}
                            </p>

                            <p className="mt-1 text-sm text-gray-600">
                              Links: {pathResult.path.length} | Weight:{' '}
                              {pathResult.weight.toFixed(3)} | Baseline teams in path:{' '}
                              {pathResult.baselineCount} | Consistency factor:{' '}
                              {pathResult.consistencyScore.toFixed(3)}
                            </p>

                            <div className="mt-3 space-y-2 text-sm text-gray-700">
                              {pathResult.path.map((edge, edgeIndex) => {
                                const match = matchesById[edge.matchId]
                                if (!match) return null

                                return (
                                  <div key={edgeIndex} className="rounded-lg bg-gray-50 p-3">
                                    {getMatchSummary(match, edge.from, teams)}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}