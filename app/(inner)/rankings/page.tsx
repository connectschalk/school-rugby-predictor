'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

type Pool = {
  poolId: number
  teamIds: number[]
  matches: Match[]
  rankings: RankedTeam[]
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

  return pools
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

export default function RankingsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [season, setSeason] = useState('2026')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

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

  const pools = useMemo<Pool[]>(() => {
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
      .sort((a, b) => b.teamIds.length - a.teamIds.length)
  }, [matches, teams])

  const normalizedSearch = searchTerm.trim().toLowerCase()

  const orderedPools = useMemo(() => {
    if (!normalizedSearch) return pools

    const matchingPools: Pool[] = []
    const otherPools: Pool[] = []

    for (const pool of pools) {
      const hasMatch = pool.rankings.some((team) =>
        team.teamName.toLowerCase().includes(normalizedSearch)
      )

      if (hasMatch) {
        matchingPools.push(pool)
      } else {
        otherPools.push(pool)
      }
    }

    return [...matchingPools, ...otherPools]
  }, [pools, normalizedSearch])

  const hasAnyMatch = useMemo(() => {
    if (!normalizedSearch) return true

    return pools.some((pool) =>
      pool.rankings.some((team) =>
        team.teamName.toLowerCase().includes(normalizedSearch)
      )
    )
  }, [pools, normalizedSearch])

  const visiblePools = useMemo(() => {
    return orderedPools
      .map((pool) => {
        const filteredRankings = pool.rankings.filter(
          (team) => team.teamName.trim().toLowerCase() !== 'nudgee'
        )

        if (filteredRankings.length === 0) return null

        return {
          ...pool,
          rankings: filteredRankings,
        }
      })
      .filter(Boolean) as Pool[]
  }, [orderedPools])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h1 className="text-3xl font-bold">Connected Pool Rankings</h1>
        <p className="mt-2 text-gray-600">
          Teams are ranked only inside linked pools. When a new match connects two pools,
          they merge automatically and rankings are recalculated using all linked margins.
        </p>

        <div className="mt-4">
          <Link
            href="/consistency"
            className="inline-flex rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            View Top 10 Margin Consistency
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="max-w-xs">
            <label className="mb-2 block text-sm font-medium">Season</label>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>

          <div className="max-w-md">
            <label className="mb-2 block text-sm font-medium">Search Team</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type a school name to highlight it"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
        </div>

        {normalizedSearch && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Matching pool(s) moved to the top. Highlighting teams matching:{' '}
            <span className="font-semibold">{searchTerm}</span>
          </div>
        )}

        {loading && <p className="mt-6">Loading rankings...</p>}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && pools.length === 0 && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            No connected pools yet for this season.
          </div>
        )}

        {!loading && !error && pools.length > 0 && normalizedSearch && !hasAnyMatch && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            No teams found for that search.
          </div>
        )}

        {!loading && !error && visiblePools.length > 0 && (
          <div className="mt-8 space-y-10">
            {visiblePools.map((pool) => {
              const poolHasMatch =
                normalizedSearch.length > 0 &&
                pool.rankings.some((team) =>
                  team.teamName.toLowerCase().includes(normalizedSearch)
                )

              return (
                <section
                  key={pool.poolId}
                  className={`rounded-2xl border p-6 shadow-sm ${
                    poolHasMatch ? 'border-yellow-400 bg-yellow-50/40' : 'border-gray-200'
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">Pool {pool.poolId}</h2>
                      <p className="mt-1 text-sm text-gray-600">
                        {pool.teamIds.length} team(s), {pool.matches.length} match(es)
                      </p>
                    </div>

                    <div className="text-sm text-gray-600">
                      Linked teams are ranked relative to each other using actual match margins.
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="min-w-full bg-white">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-3 text-left">Rank</th>
                          <th className="p-3 text-left">Team</th>
                          <th className="p-3 text-left">Relative Score</th>
                          <th className="p-3 text-left">W</th>
                          <th className="p-3 text-left">D</th>
                          <th className="p-3 text-left">L</th>
                          <th className="p-3 text-left">PF</th>
                          <th className="p-3 text-left">PA</th>
                          <th className="p-3 text-left">Avg Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pool.rankings.map((team, index) => {
                          const isMatch =
                            normalizedSearch.length > 0 &&
                            team.teamName.toLowerCase().includes(normalizedSearch)

                          return (
                            <tr
                              key={team.teamId}
                              className={`border-t ${isMatch ? 'bg-yellow-100' : ''}`}
                            >
                              <td className="p-3 font-semibold">{index + 1}</td>
                              <td className={`p-3 ${isMatch ? 'font-bold' : ''}`}>
                                {team.teamName}
                              </td>
                              <td className="p-3 font-semibold">
                                {team.relativeScore > 0 ? `+${team.relativeScore}` : team.relativeScore}
                              </td>
                              <td className="p-3">{team.wins}</td>
                              <td className="p-3">{team.draws}</td>
                              <td className="p-3">{team.losses}</td>
                              <td className="p-3">{team.pointsFor}</td>
                              <td className="p-3">{team.pointsAgainst}</td>
                              <td className="p-3">
                                {team.averageMargin > 0 ? `+${team.averageMargin}` : team.averageMargin}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold">Teams in this pool</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pool.rankings.map((team) => {
                        const isMatch =
                          normalizedSearch.length > 0 &&
                          team.teamName.toLowerCase().includes(normalizedSearch)

                        return (
                          <span
                            key={team.teamId}
                            className={`rounded-full border px-3 py-1 text-sm ${
                              isMatch
                                ? 'border-yellow-400 bg-yellow-100 font-semibold'
                                : 'border-gray-300'
                            }`}
                          >
                            {team.teamName}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-lg font-semibold">Matches linking this pool</h3>
                    <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200">
                      <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-left">Team A</th>
                            <th className="p-3 text-left">Score</th>
                            <th className="p-3 text-left">Team B</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pool.matches.map((match) => {
                            const teamAName =
                              teams.find((t) => t.id === match.team_a_id)?.name || `Team ${match.team_a_id}`
                            const teamBName =
                              teams.find((t) => t.id === match.team_b_id)?.name || `Team ${match.team_b_id}`

                            const teamAMatch =
                              normalizedSearch.length > 0 &&
                              teamAName.toLowerCase().includes(normalizedSearch)

                            const teamBMatch =
                              normalizedSearch.length > 0 &&
                              teamBName.toLowerCase().includes(normalizedSearch)

                            return (
                              <tr key={match.id} className="border-t">
                                <td className="p-3">
                                  {new Date(match.match_date).toLocaleDateString()}
                                </td>
                                <td className={`p-3 ${teamAMatch ? 'bg-yellow-100 font-semibold' : ''}`}>
                                  {teamAName}
                                </td>
                                <td className="p-3 font-semibold">
                                  {match.team_a_score} - {match.team_b_score}
                                </td>
                                <td className={`p-3 ${teamBMatch ? 'bg-yellow-100 font-semibold' : ''}`}>
                                  {teamBName}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}