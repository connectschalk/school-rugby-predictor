'use client'

import { useCallback, useEffect, useState } from 'react'
import type { GameMatch, MatchLeaderboardEntry } from '@/lib/public-prediction-game'
import { fetchMatchLeaderboardWithProfiles } from '@/lib/public-prediction-game'
import Link from 'next/link'
import LetterAvatar from '@/components/LetterAvatar'
import { supabase } from '@/lib/supabase'

type Props = {
  match: GameMatch
  signedIn: boolean
}

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function CompletedMatchLeaderboard({ match, signedIn }: Props) {
  const [rows, setRows] = useState<MatchLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scoring, setScoring] = useState(false)
  const [scoreMsg, setScoreMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { rows: next, error: e } = await fetchMatchLeaderboardWithProfiles(supabase, match.id)
    if (e) {
      setError(e.message)
      setRows([])
    } else {
      setRows(next)
    }
    setLoading(false)
  }, [match.id])

  useEffect(() => {
    void load()
  }, [load])

  const runScoring = async () => {
    if (!signedIn) return
    setScoring(true)
    setScoreMsg('')
    setError('')
    const { data, error: rpcError } = await supabase.rpc('score_predictions_for_match', {
      p_match_id: match.id,
    })
    if (rpcError) {
      setError(rpcError.message)
      setScoring(false)
      return
    }
    setScoreMsg(`Scored ${typeof data === 'number' ? data : 0} prediction(s).`)
    await load()
    setScoring(false)
  }

  const hs = match.home_score ?? '—'
  const as = match.away_score ?? '—'

  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {formatKickoff(match.kickoff_time)} · Final
          </p>
          <h2 className="mt-2 text-xl font-semibold md:text-2xl">
            <span className="text-gray-900">{match.home_team}</span>
            <span className="mx-2 font-bold text-gray-900">
              {hs} – {as}
            </span>
            <span className="text-gray-900">{match.away_team}</span>
          </h2>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          Completed
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Match leaderboard (by points, then closer margin guesses first).
        </p>
        {signedIn ? (
          <button
            type="button"
            onClick={() => void runScoring()}
            disabled={scoring}
            className="shrink-0 rounded-2xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          >
            {scoring ? 'Scoring…' : 'Run scoring'}
          </button>
        ) : null}
      </div>

      {scoreMsg ? (
        <p className="mt-3 text-sm text-emerald-800">{scoreMsg}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-gray-500">Loading results…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">
            No predictions have been scored yet. Run scoring to update the leaderboard. Leaderboard will appear once
            scoring has run.
          </p>
        ) : (
          <table className="w-full min-w-[320px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 pr-2 text-right">Pts</th>
                <th className="py-2 text-right">Margin diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${match.id}-${r.user_id}`} className="border-b border-gray-100">
                  <td className="py-3 pr-2 font-medium text-gray-900">{r.rank}</td>
                  <td className="py-3 pr-2">
                    <div className="flex items-center gap-2">
                      <LetterAvatar
                        letter={r.avatar_letter}
                        colour={r.avatar_colour}
                        avatarUrl={r.avatar_url}
                        firstName={r.first_name}
                        displayName={r.display_name}
                        name={r.display_name}
                        size={32}
                        className="ring-1 ring-gray-200"
                      />
                      <span className="font-medium text-gray-900">{r.display_name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-right tabular-nums">{r.total_points}</td>
                  <td className="py-3 text-right tabular-nums text-gray-600">
                    {r.margin_difference === null ? '—' : r.margin_difference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
        <Link
          href={`/predict-score/${match.id}`}
          className="inline-flex border-2 border-gray-800 bg-white px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-gray-900 hover:bg-gray-50"
        >
          View comments
        </Link>
      </div>
    </article>
  )
}
