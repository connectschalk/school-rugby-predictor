'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import MatchBanter from '@/components/predict-score/MatchBanter'
import { fetchGameMatchById, type GameMatch } from '@/lib/public-prediction-game'
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-12">
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
      </div>

      <div className="mt-10">
        <h2 className="inline-block bg-slate-900 px-4 py-2 text-sm font-black uppercase tracking-wide text-white">
          Comments
        </h2>
        <div className="mt-4 border-2 border-gray-200 bg-white p-4">
          <MatchBanter matchId={match.id} signedIn={!!user} userId={user?.id ?? null} />
        </div>
      </div>
    </main>
  )
}
