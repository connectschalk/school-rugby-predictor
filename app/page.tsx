'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
}

type Match = {
  id: number
  match_date: string
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
}

type Edge = {
  to: string
  margin: number
  matchId: number
}

type PathResult = {
  totalMargin: number
  path: Edge[]
}

function buildGraph(matches: Match[]) {
  const graph: Record<string, Edge[]> = {}

  for (const match of matches) {
    const a = String(match.team_a_id)
    const b = String(match.team_b_id)
    const margin = match.team_a_score - match.team_b_score

    if (!graph[a]) graph[a] = []
    if (!graph[b]) graph[b] = []

    graph[a].push({ to: b, margin, matchId: match.id })
    graph[b].push({ to: a, margin: -margin, matchId: match.id })
  }

  return graph
}

function findPaths(
  graph: Record<string, Edge[]>,
  start: string,
  end: string,
  maxDepth = 3
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
      results.push({
        totalMargin,
        path: [...path],
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

function getConfidence(pathCount: number) {
  if (pathCount >= 4) return 'High'
  if (pathCount >= 2) return 'Medium'
  if (pathCount === 1) return 'Low'
  return 'None'
}

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    averageMargin: number
    pathCount: number
    confidence: string
  } | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .order('name')

      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('id, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
        .order('match_date', { ascending: false })

      if (teamsError || matchesError) {
        setError((teamsError || matchesError)?.message || 'Could not load data.')
        setLoading(false)
        return
      }

      setTeams((teamsData as Team[]) || [])
      setMatches((matchesData as Match[]) || [])
      setLoading(false)
    }

    loadData()
  }, [])

  const graph = useMemo(() => buildGraph(matches), [matches])

  const teamAName = teams.find((t) => String(t.id) === teamA)?.name || 'Team A'
  const teamBName = teams.find((t) => String(t.id) === teamB)?.name || 'Team B'

  function runPrediction() {
    setError('')
    setResult(null)

    if (!teamA || !teamB) {
      setError('Please choose two teams.')
      return
    }

    if (teamA === teamB) {
      setError('Please choose two different teams.')
      return
    }

    const paths = findPaths(graph, teamA, teamB, 3)

    if (paths.length === 0) {
      setError('Not enough data.')
      return
    }

    const averageMargin =
      paths.reduce((sum, p) => sum + p.totalMargin, 0) / paths.length

    setResult({
      averageMargin: Math.round(averageMargin * 10) / 10,
      pathCount: paths.length,
      confidence: getConfidence(paths.length),
    })
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold">School Rugby Predictor</h1>
        <p className="mt-2 text-gray-600">
          Choose two teams and get a projected margin based on linked match results.
        </p>

        <div className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
          {loading ? (
            <p>Loading teams and matches...</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Team A</label>
                  <select
                    value={teamA}
                    onChange={(e) => setTeamA(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Team A</option>
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
                    value={teamB}
                    onChange={(e) => setTeamB(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  >
                    <option value="">Choose Team B</option>
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
                <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <h2 className="text-xl font-semibold">Prediction</h2>
                  <p className="mt-3 text-lg">
                    {result.averageMargin > 0
                      ? `${teamAName} by ${Math.abs(result.averageMargin)}`
                      : result.averageMargin < 0
                      ? `${teamBName} by ${Math.abs(result.averageMargin)}`
                      : 'Projected draw'}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Confidence: {result.confidence}
                  </p>
                  <p className="text-sm text-gray-600">
                    Based on {result.pathCount} linking path(s)
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}