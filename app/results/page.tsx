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

export default function ResultsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [season, setSeason] = useState('2026')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
        .eq('season', Number(season))
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
  }, [season])

  const rows = useMemo(() => {
    return matches.map((match) => ({
      ...match,
      teamAName: teams.find((t) => t.id === match.team_a_id)?.name || `Team ${match.team_a_id}`,
      teamBName: teams.find((t) => t.id === match.team_b_id)?.name || `Team ${match.team_b_id}`,
    }))
  }, [matches, teams])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Match Results</h1>
        <p className="mt-2 text-gray-600">
          All recorded match results for the selected season.
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

        {loading && <p className="mt-6">Loading results...</p>}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-4 py-3 text-sm font-semibold">Date</th>
                  <th className="px-4 py-3 text-sm font-semibold">Team A</th>
                  <th className="px-4 py-3 text-sm font-semibold">Score</th>
                  <th className="px-4 py-3 text-sm font-semibold">Team B</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-sm text-gray-500">
                      No results found for this season.
                    </td>
                  </tr>
                ) : (
                  rows.map((match) => (
                    <tr key={match.id} className="border-t border-gray-200">
                      <td className="px-4 py-3 text-sm">
                        {new Date(match.match_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">{match.teamAName}</td>
                      <td className="px-4 py-3 text-sm font-semibold">
                        {match.team_a_score} - {match.team_b_score}
                      </td>
                      <td className="px-4 py-3 text-sm">{match.teamBName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}