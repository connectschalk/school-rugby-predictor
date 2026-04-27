'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import MatchBanter from '@/components/predict-score/MatchBanter'
import { formatKickoffHm, matchPredictionsClosed } from '@/lib/prediction-cutoff'
import {
  fetchGameMatchById,
  fetchMatchLeaderboardWithProfiles,
  type GameMatch,
  type MatchLeaderboardEntry,
} from '@/lib/public-prediction-game'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function PredictScoreMatchPage() {
  const params = useParams()
  const matchId = typeof params.matchId === 'string' ? params.matchId : ''

  const [user, setUser] = useState<User | null>(null)
  const [match, setMatch] = useState<GameMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [leaderboardRows, setLeaderboardRows] = useState<MatchLeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState('')

  const loadMatch = useCallback(async () => {
    if (!matchId) {
      setNotFound(true)
      setMatch(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { match: m, error } = await fetchGameMatchById(supabase, matchId)
    if (error || !m) {
      setNotFound(true)
      setMatch(null)
    } else {
      setNotFound(false)
      setMatch(m)
    }
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    trackEvent('page_view', 'predict-score-match')
  }, [])

  useEffect(() => {
    void loadMatch()
  }, [loadMatch])

  useEffect(() => {
    if (!matchId) {
      setLeaderboardRows([])
      setLeaderboardLoading(false)
      return
    }
    let cancelled = false
    setLeaderboardLoading(true)
    setLeaderboardError('')
    void fetchMatchLeaderboardWithProfiles(supabase, matchId).then(({ rows, error }) => {
      if (cancelled) return
      if (error) {
        setLeaderboardRows([])
        setLeaderboardError(error.message)
      } else {
        setLeaderboardRows(rows)
      }
      setLeaderboardLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [matchId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-gray-500">
        Loading match…
      </main>
    )
  }

  if (notFound || !match) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Match not found</h1>
        <p className="mt-3 text-gray-600">This fixture does not exist or was removed.</p>
        <Link
          href="/predict-score"
          className="mt-8 inline-block border-2 border-teal-950 bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900"
        >
          Back to Predict a Score
        </Link>
      </main>
    )
  }

  const hs = match.home_score
  const as = match.away_score
  const finalLine =
    match.status === 'completed' && hs != null && as != null
      ? `${match.home_team} ${hs} – ${as} ${match.away_team}`
      : `${match.home_team} vs ${match.away_team}`
  const homeLogo = getSchoolTeamLogoPath(match.home_team)
  const awayLogo = getSchoolTeamLogoPath(match.away_team)
  const at = new Date()
  const closed = matchPredictionsClosed(match, at)
  const kickHm = formatKickoffHm(match.kickoff_time)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-28">
      <Link
        href="/predict-score"
        className="text-sm font-semibold text-teal-900 underline hover:text-teal-950"
      >
        ← Back to slip
      </Link>

      <div className="mt-6 border-2 border-gray-900 bg-white p-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-teal-900">
          {match.status === 'completed'
            ? 'Completed'
            : match.status === 'locked'
              ? 'Locked'
              : 'Upcoming'}
        </p>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
          <div className="flex items-center gap-3">
            {homeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={homeLogo}
                alt=""
                className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-gray-200 bg-teal-50 text-lg font-bold text-teal-900">
                {match.home_team.trim().slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-lg font-bold text-gray-900">{match.home_team}</span>
          </div>
          <span className="text-sm font-black text-gray-400">VS</span>
          <div className="flex items-center gap-3">
            {awayLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={awayLogo}
                alt=""
                className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-gray-200 bg-teal-50 text-lg font-bold text-teal-900">
                {match.away_team.trim().slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-lg font-bold text-gray-900">{match.away_team}</span>
          </div>
        </div>
        {match.status === 'completed' && hs != null && as != null ? (
          <p className="mt-4 text-center text-2xl font-black tabular-nums text-gray-900">
            {hs} – {as}
          </p>
        ) : null}
        <h1 className="sr-only">{finalLine}</h1>
        <p className="mt-4 text-center text-sm text-gray-600">{formatKickoff(match.kickoff_time)}</p>
        {closed ? (
          <p className="mt-2 text-center text-xs font-semibold text-gray-600">Predictions closed</p>
        ) : (
          <div className="mt-2 space-y-0.5 text-center text-xs font-medium text-gray-600">
            <p>Predictions close at kickoff</p>
            {kickHm ? <p>Kickoff: {kickHm}</p> : null}
          </div>
        )}
      </div>

      <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-black text-gray-900">Leaderboard</h2>
        <p className="mt-1 text-sm text-gray-600">Ranked by points, then closer margin predictions.</p>
        {leaderboardError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {leaderboardError}
          </p>
        ) : null}
        {leaderboardLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading leaderboard…</p>
        ) : leaderboardRows.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">
            No predictions have been scored yet. Run scoring to update the leaderboard. Leaderboard will appear once
            scoring has run.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Player</th>
                  <th className="py-2 pr-2 text-right">Pts</th>
                  <th className="py-2 text-right">Margin diff</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardRows.map((r) => (
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
          </div>
        )}
      </div>

      <section id="comments" className="mt-10">
        <h2 className="inline-block bg-slate-900 px-4 py-2 text-sm font-black uppercase tracking-wide text-white">
          Comments
        </h2>
        <div className="mt-4 border-2 border-gray-200 bg-white p-4">
          <MatchBanter matchId={match.id} signedIn={!!user} userId={user?.id ?? null} />
        </div>
      </section>

      <Link
        href={`/discussion?matchId=${match.id}`}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center justify-center rounded-full border border-red-700 bg-red-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 md:bottom-6 md:right-6"
      >
        Comments
      </Link>
    </main>
  )
}
