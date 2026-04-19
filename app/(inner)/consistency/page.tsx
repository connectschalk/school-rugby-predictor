'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
}

type ConsistencyRow = {
  team_id: number
  season: number
  prediction_error?: number | null
  total_prediction_error?: number | null
  avg_prediction_error?: number | null
  matches_evaluated: number
  consistency_score: number
  sample_confidence: number
  adjusted_consistency: number
  anchor_status: string
}

type RankedConsistency = ConsistencyRow & {
  teamName: string
  averageError: number
}

export default function ConsistencyPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [rows, setRows] = useState<ConsistencyRow[]>([])
  const [season, setSeason] = useState('2026')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    async function loadConsistency() {
      setLoading(true)
      setError('')

      const { data, error: consistencyError } = await supabase
        .from('team_consistency')
        .select(
          'team_id, season, prediction_error, total_prediction_error, avg_prediction_error, matches_evaluated, consistency_score, sample_confidence, adjusted_consistency, anchor_status'
        )
        .eq('season', Number(season))

      if (consistencyError) {
        setError(consistencyError.message)
        setRows([])
      } else {
        setRows((data as ConsistencyRow[]) || [])
      }

      setLoading(false)
    }

    loadConsistency()
  }, [season])

  const topTeams = useMemo<RankedConsistency[]>(() => {
    const byId = new Map(teams.map((team) => [team.id, team.name]))

    return rows
      .map((row) => {
        const averageError =
          row.avg_prediction_error != null && row.avg_prediction_error !== undefined
            ? row.avg_prediction_error
            : row.matches_evaluated > 0
              ? (row.total_prediction_error ?? row.prediction_error ?? 0) / row.matches_evaluated
              : row.total_prediction_error ?? row.prediction_error ?? 0

        return {
          ...row,
          teamName: byId.get(row.team_id) || `Team ${row.team_id}`,
          averageError: Math.round(averageError * 10) / 10,
        }
      })
      .sort((a, b) => {
        if (b.adjusted_consistency !== a.adjusted_consistency) {
          return b.adjusted_consistency - a.adjusted_consistency
        }
        if (b.matches_evaluated !== a.matches_evaluated) {
          return b.matches_evaluated - a.matches_evaluated
        }
        return a.averageError - b.averageError
      })
      .slice(0, 10)
  }, [rows, teams])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Top 10 Most Consistent Margin Teams</h1>
        <p className="mt-2 text-gray-600">
          Consistency is based on how close predicted margins were to actual margins.
          Higher adjusted consistency means margins were predicted more reliably.
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

        {loading && <p className="mt-6">Loading consistency rankings...</p>}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && topTeams.length === 0 && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
            No consistency data found for this season. Add results via Admin (single match add) or run{' '}
            <span className="font-semibold">Recalculate consistency</span> after prediction history exists.
          </div>
        )}

        {!loading && !error && topTeams.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left">Rank</th>
                  <th className="p-3 text-left">Team</th>
                  <th className="p-3 text-left">Adjusted Consistency</th>
                  <th className="p-3 text-left">Consistency</th>
                  <th className="p-3 text-left">Matches Evaluated</th>
                  <th className="p-3 text-left">Average Margin Error</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {topTeams.map((team, index) => (
                  <tr key={team.team_id} className="border-t">
                    <td className="p-3 font-semibold">{index + 1}</td>
                    <td className="p-3">{team.teamName}</td>
                    <td className="p-3 font-semibold">{team.adjusted_consistency.toFixed(3)}</td>
                    <td className="p-3">{team.consistency_score.toFixed(3)}</td>
                    <td className="p-3">{team.matches_evaluated}</td>
                    <td className="p-3">{team.averageError}</td>
                    <td className="p-3 capitalize">{team.anchor_status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
