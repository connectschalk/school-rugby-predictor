'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { MY_PREDICTIONS_TABS, myPredictionsTabActive } from '@/lib/competition-nav'
import { competitionCardTitle, isSoccerExactScoreMode, type CompetitionScoringMode } from '@/lib/competitions'
import { canEditPredictionOnMatch } from '@/lib/prediction-cutoff'
import {
  completedPredictionBadge,
  computeMyPredictionsBreakdown,
  computeMyPredictionsStats,
  formatPredictionPick,
  predictHrefForRow,
  splitMyPredictionRows,
} from '@/lib/my-predictions'
import { fetchMyPredictionsOverview, type MyPredictionOverviewRow } from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'
import { usePathname } from 'next/navigation'

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

function cardShell(children: ReactNode) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {children}
    </div>
  )
}

export type MyPredictionsPanelProps = {
  mode: 'overall' | 'competition'
  competition?: {
    id: string
    slug: string
    name: string
    scoringMode: CompetitionScoringMode
  }
}

export default function MyPredictionsPanel({ mode, competition }: MyPredictionsPanelProps) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [rows, setRows] = useState<MyPredictionOverviewRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const isOverall = mode === 'overall'
  const soccerMode = competition ? isSoccerExactScoreMode(competition.scoringMode) : false
  const competitionTitle = competition
    ? competitionCardTitle(competition.slug, competition.name)
    : null

  const backHref = isOverall ? '/' : `/competitions/${competition!.slug}/predict`
  const predictHref = isOverall ? '/competitions/nextplay-schools/predict' : backHref

  const load = useCallback(
    async (uid: string) => {
      setLoading(true)
      setLoadError('')
      const { rows: data, error } = await fetchMyPredictionsOverview(
        supabase,
        uid,
        isOverall || !competition
          ? undefined
          : { competitionId: competition.id, competitionSlug: competition.slug }
      )
      if (error) {
        setLoadError(error.message)
        setRows([])
      } else {
        setRows(data)
      }
      setLoading(false)
    },
    [competition, isOverall]
  )

  useEffect(() => {
    trackEvent('page_view', isOverall ? 'my-predictions-overall' : 'my-predictions-competition')
  }, [isOverall])

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

  const stats = useMemo(() => computeMyPredictionsStats(rows), [rows])
  const breakdown = useMemo(
    () => (isOverall ? computeMyPredictionsBreakdown(rows) : []),
    [isOverall, rows]
  )
  const { upcoming, completed } = useMemo(() => splitMyPredictionRows(rows), [rows])

  const showExactMargins = isOverall
    ? breakdown.some((b) => b.scoringMode === 'rugby_margin' && b.exactMargins > 0) || stats.exactMargins > 0
    : !soccerMode && stats.exactMargins > 0

  const showExactScores = isOverall
    ? breakdown.some((b) => b.scoringMode === 'soccer_exact_score' && b.exactScores > 0) ||
      stats.exactScores > 0
    : soccerMode && stats.exactScores > 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-20 pt-8">
      <div className="mx-auto max-w-2xl space-y-8 px-4">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">My Predictions</h1>
          {competitionTitle ? (
            <p className="mt-2 text-sm font-semibold text-slate-700">{competitionTitle}</p>
          ) : (
            <p className="mt-2 text-sm font-medium text-slate-500">All competitions · combined view</p>
          )}
          <p className="mt-1 text-sm font-medium text-slate-500">
            Track picks, results, and points in one place.
          </p>

          <nav
            className="mt-5 flex flex-wrap justify-center gap-2"
            aria-label="Competition filter"
          >
            {MY_PREDICTIONS_TABS.map((tab) => {
              const active = myPredictionsTabActive(pathname, tab)
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href={backHref}
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
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {loadError}
          </p>
        ) : null}

        {user && !loading && rows.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-800">
              {isOverall
                ? "You haven't made any predictions yet"
                : `No ${competitionTitle ?? 'competition'} predictions yet`}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Head to Predict to pick upcoming fixtures for this competition.
            </p>
            <Link
              href={predictHref}
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50/80 px-3 py-3 text-center ring-1 ring-emerald-100">
                  <p className="text-2xl font-black tabular-nums text-emerald-900">{stats.correct}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    Correct
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50/80 px-3 py-3 text-center ring-1 ring-amber-100">
                  <p className="text-2xl font-black tabular-nums text-amber-950">
                    {stats.accuracyPct === null ? '—' : `${stats.accuracyPct}%`}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    Accuracy
                  </p>
                </div>
                <div className="rounded-xl bg-slate-900 px-3 py-3 text-center text-white ring-1 ring-slate-800">
                  <p className="text-2xl font-black tabular-nums">{stats.totalPoints.toFixed(1)}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Points
                  </p>
                </div>
              </div>
              {showExactMargins ? (
                <p className="mt-3 text-center text-xs font-medium text-amber-800">
                  Exact margins: {stats.exactMargins} (scored rugby fixtures only)
                </p>
              ) : null}
              {showExactScores ? (
                <p className="mt-3 text-center text-xs font-medium text-amber-800">
                  Exact scores: {stats.exactScores} (scored soccer fixtures only)
                </p>
              ) : null}
              {isOverall && breakdown.length > 0 ? (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    By competition
                  </p>
                  <ul className="mt-3 space-y-2">
                    {breakdown.map((b) => (
                      <li
                        key={b.competitionId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <Link
                          href={`/competitions/${b.slug}/my-predictions`}
                          className="font-semibold text-slate-900 hover:underline"
                        >
                          {competitionCardTitle(b.slug, b.name)}
                        </Link>
                        <span className="text-xs text-slate-600">
                          {b.total} picks · {b.correct} correct · {b.totalPoints.toFixed(1)} pts
                          {b.accuracyPct !== null ? ` · ${b.accuracyPct}%` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Upcoming predictions</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Upcoming and locked fixtures (not yet final).
                </p>
              </div>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : upcoming.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No upcoming predictions right now.
                </p>
              ) : (
                <ul className="space-y-4">
                  {upcoming.map((row) => {
                    const { prediction, match } = row
                    const editable =
                      match.status === 'upcoming' &&
                      canEditPredictionOnMatch(match, new Date()) &&
                      !prediction.is_locked
                    return (
                      <li key={prediction.id}>
                        {cardShell(
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-1">
                              {isOverall && row.competition ? (
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  {competitionCardTitle(row.competition.slug, row.competition.name)}
                                </p>
                              ) : null}
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {formatKickoffSast(match.kickoff_time)}
                              </p>
                              <p className="text-base font-bold text-slate-900">
                                {match.home_team}{' '}
                                <span className="font-black text-slate-400">vs</span> {match.away_team}
                              </p>
                              <p className="text-sm text-slate-600">
                                Pick:{' '}
                                <span className="font-semibold text-slate-900">
                                  {formatPredictionPick(row)}
                                </span>
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
                                  href={predictHrefForRow(row, match.id)}
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
                  {completed.map((row) => {
                    const { prediction, match, score } = row
                    const hs = match.home_score
                    const as = match.away_score
                    const scoreLine =
                      hs != null && as != null ? `${hs} – ${as}` : 'Score pending'
                    const badge = completedPredictionBadge(row)

                    return (
                      <li key={prediction.id}>
                        {cardShell(
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                {isOverall && row.competition ? (
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {competitionCardTitle(row.competition.slug, row.competition.name)}
                                  </p>
                                ) : null}
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {formatKickoffSast(match.kickoff_time)}
                                </p>
                                <p className="mt-1 text-base font-bold text-slate-900">
                                  {match.home_team}{' '}
                                  <span className="font-black text-slate-400">vs</span> {match.away_team}
                                </p>
                              </div>
                              <span className={badge.className}>{badge.label}</span>
                            </div>
                            <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm">
                              <div>
                                <p className="text-[11px] font-bold uppercase text-slate-400">Actual</p>
                                <p className="font-semibold text-slate-900">{scoreLine}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase text-slate-400">
                                  Your pick
                                </p>
                                <p className="font-semibold text-slate-900">
                                  {formatPredictionPick(row)}
                                </p>
                              </div>
                              {score ? (
                                <div>
                                  <p className="text-[11px] font-bold uppercase text-slate-400">
                                    Points
                                  </p>
                                  <p className="font-black tabular-nums text-slate-900">
                                    {score.total_points.toFixed(1)}
                                  </p>
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
