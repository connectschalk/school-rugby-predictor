'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { canEditPredictionOnMatch } from '@/lib/prediction-cutoff'
import {
  fetchMyPredictionsOverview,
  type GameMatch,
  type MyPredictionOverviewRow,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

function formatKickoffSast(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function winnerLabel(pred: UserPredictionRow, match: GameMatch) {
  return pred.predicted_winner === 'home' ? match.home_team : match.away_team
}

function cardShell(children: ReactNode) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {children}
    </div>
  )
}

export default function MyPredictionsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [rows, setRows] = useState<MyPredictionOverviewRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setLoadError('')
    const { rows: data, error } = await fetchMyPredictionsOverview(supabase, uid)
    if (error) {
      setLoadError(error.message)
      setRows([])
    } else {
      setRows(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    trackEvent('page_view', 'my-predictions')
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setAuthReady(true)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setRows([])
      setLoading(false)
      return
    }
    void load(user.id)
  }, [user, load])

  const { upcoming, completed, stats } = useMemo(() => {
    const usable = rows.filter((r) => r.match.status !== 'cancelled')
    const upcoming = usable
      .filter((r) => r.match.status === 'upcoming' || r.match.status === 'locked')
      .sort((a, b) => new Date(a.match.kickoff_time).getTime() - new Date(b.match.kickoff_time).getTime())
    const completed = usable
      .filter((r) => r.match.status === 'completed')
      .sort((a, b) => new Date(b.match.kickoff_time).getTime() - new Date(a.match.kickoff_time).getTime())

    const scored = completed.filter((r) => r.score !== null)
    const correct = scored.filter((r) => r.score!.winner_correct).length
    const totalPoints = scored.reduce((s, r) => s + (r.score?.total_points ?? 0), 0)
    const exactMargins = scored.filter(
      (r) =>
        r.score!.winner_correct &&
        r.score!.margin_difference !== null &&
        r.score!.margin_difference === 0
    ).length

    return {
      upcoming,
      completed,
      stats: {
        total: usable.length,
        scoredCompleted: scored.length,
        correct,
        accuracyPct: scored.length ? Math.round((correct / scored.length) * 1000) / 10 : null,
        totalPoints,
        exactMargins,
      },
    }
  }, [rows])

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-20 pt-8">
      <div className="mx-auto max-w-2xl space-y-8 px-4">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">My Predictions</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Track picks, results, and points in one place.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/predict-score"
              className="inline-flex rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-black"
            >
              Back to Predict
            </Link>
          </div>
        </header>

        {!authReady ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : !user ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-900">Log in to see your predictions</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-black"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
              >
                Sign up
              </Link>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>
        ) : null}

        {user && !loading && rows.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-800">You haven&apos;t made any predictions yet</p>
            <p className="mt-2 text-sm text-slate-500">Head to Predict to pick winners and margins for upcoming fixtures.</p>
            <Link
              href="/predict-score"
              className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-black"
            >
              Go to Predict
            </Link>
          </div>
        ) : null}

        {user && rows.length > 0 ? (
          <>
            <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Summary</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-center ring-1 ring-slate-100">
                  <p className="text-2xl font-black tabular-nums text-slate-900">{stats.total}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 px-3 py-3 text-center ring-1 ring-emerald-100">
                  <p className="text-2xl font-black tabular-nums text-emerald-900">{stats.correct}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Correct</p>
                </div>
                <div className="rounded-xl bg-amber-50/80 px-3 py-3 text-center ring-1 ring-amber-100">
                  <p className="text-2xl font-black tabular-nums text-amber-950">
                    {stats.accuracyPct === null ? '—' : `${stats.accuracyPct}%`}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">Accuracy</p>
                </div>
                <div className="rounded-xl bg-slate-900 px-3 py-3 text-center text-white ring-1 ring-slate-800">
                  <p className="text-2xl font-black tabular-nums">{stats.totalPoints.toFixed(1)}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Points</p>
                </div>
              </div>
              {stats.exactMargins > 0 ? (
                <p className="mt-3 text-center text-xs font-medium text-amber-800">
                  Exact margins: {stats.exactMargins} (scored fixtures only)
                </p>
              ) : null}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Upcoming predictions</h2>
                <p className="mt-1 text-xs text-slate-500">Upcoming and locked fixtures (not yet final).</p>
              </div>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : upcoming.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No upcoming predictions right now.
                </p>
              ) : (
                <ul className="space-y-4">
                  {upcoming.map(({ prediction, match }) => {
                    const editable =
                      match.status === 'upcoming' &&
                      canEditPredictionOnMatch(match, new Date()) &&
                      !prediction.is_locked
                    return (
                      <li key={prediction.id}>
                        {cardShell(
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {formatKickoffSast(match.kickoff_time)}
                              </p>
                              <p className="text-base font-bold text-slate-900">
                                {match.home_team}{' '}
                                <span className="font-black text-slate-400">vs</span> {match.away_team}
                              </p>
                              <p className="text-sm text-slate-600">
                                Pick: <span className="font-semibold text-slate-900">{winnerLabel(prediction, match)}</span>{' '}
                                by <span className="font-semibold text-slate-900">{prediction.predicted_margin}</span>{' '}
                                pts
                              </p>
                              {prediction.is_locked ? (
                                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                  Locked
                                </span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {editable ? (
                                <Link
                                  href={`/predict-score?focus=${encodeURIComponent(match.id)}`}
                                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black"
                                >
                                  Edit
                                </Link>
                              ) : null}
                              <Link
                                href={`/predict-score/${match.id}`}
                                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                              >
                                Discussion
                              </Link>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-black text-slate-900">Completed predictions</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : completed.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No completed results yet — check back after fixtures finish.
                </p>
              ) : (
                <ul className="space-y-4">
                  {completed.map(({ prediction, match, score }) => {
                    const hs = match.home_score
                    const as = match.away_score
                    const scoreLine =
                      hs != null && as != null ? `${hs} – ${as}` : 'Score pending'
                    const exact =
                      score &&
                      score.winner_correct &&
                      score.margin_difference !== null &&
                      score.margin_difference === 0
                    const correct = score?.winner_correct === true
                    const badge = !score ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        Not scored yet
                      </span>
                    ) : exact ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-950 ring-2 ring-amber-300">
                        Exact margin
                      </span>
                    ) : correct ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
                        Correct winner
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                        Wrong pick
                      </span>
                    )

                    return (
                      <li key={prediction.id}>
                        {cardShell(
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {formatKickoffSast(match.kickoff_time)}
                                </p>
                                <p className="mt-1 text-base font-bold text-slate-900">
                                  {match.home_team}{' '}
                                  <span className="font-black text-slate-400">vs</span> {match.away_team}
                                </p>
                              </div>
                              {badge}
                            </div>
                            <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm">
                              <div>
                                <p className="text-[11px] font-bold uppercase text-slate-400">Actual</p>
                                <p className="font-semibold text-slate-900">{scoreLine}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase text-slate-400">Your pick</p>
                                <p className="font-semibold text-slate-900">
                                  {winnerLabel(prediction, match)} by {prediction.predicted_margin} pts
                                </p>
                              </div>
                              {score ? (
                                <div>
                                  <p className="text-[11px] font-bold uppercase text-slate-400">Points</p>
                                  <p className="font-black tabular-nums text-slate-900">{score.total_points.toFixed(1)}</p>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex justify-end">
                              <Link
                                href={`/predict-score/${match.id}`}
                                className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                              >
                                Match recap &amp; discussion
                              </Link>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
