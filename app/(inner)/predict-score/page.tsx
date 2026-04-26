'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import HowItWorksModal from '@/components/HowItWorksModal'
import CompletedMatchLeaderboard from '@/components/predict-score/CompletedMatchLeaderboard'
import PredictionSlipRow, { type SlipPick } from '@/components/predict-score/PredictionSlipRow'
import {
  fetchCompletedGameMatches,
  fetchPlayableGameMatches,
  fetchUserPredictionsForMatches,
  type GameMatch,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

function predictionMap(rows: UserPredictionRow[]) {
  const m = new Map<string, UserPredictionRow>()
  for (const r of rows) {
    m.set(r.match_id, r)
  }
  return m
}

function parseMargin(s: string): number | null {
  const m = Number(String(s).trim())
  if (!Number.isFinite(m) || m < 1 || !Number.isInteger(m)) return null
  return m
}

async function ensureUserProfile(user: User) {
  const displayName =
    (typeof user.user_metadata?.full_name === 'string' &&
      user.user_metadata.full_name.trim()) ||
    user.email?.split('@')[0]?.trim() ||
    'Player'

  const { error } = await supabase.from('user_profiles').upsert(
    { id: user.id, display_name: displayName },
    { onConflict: 'id' }
  )
  return error
}

export default function PredictScorePage() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [completedMatches, setCompletedMatches] = useState<GameMatch[]>([])
  const [predictions, setPredictions] = useState<Map<string, UserPredictionRow>>(
    () => new Map()
  )
  const [slipByMatch, setSlipByMatch] = useState<Record<string, SlipPick>>({})
  const [loadError, setLoadError] = useState('')
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [flashSubmittedId, setFlashSubmittedId] = useState<string | null>(null)
  const [bulkSaveMsg, setBulkSaveMsg] = useState('')
  const [howModalOpen, setHowModalOpen] = useState(false)

  const signedIn = !!user

  const reloadPredictions = useCallback(async (uid: string, matchIds: string[]) => {
    const { data, error } = await fetchUserPredictionsForMatches(supabase, uid, matchIds)
    if (error) {
      setLoadError(error.message)
      return
    }
    setPredictions(predictionMap(data))
  }, [])

  const loadMatches = useCallback(async () => {
    setLoadingMatches(true)
    setLoadError('')
    const [upcomingRes, completedRes] = await Promise.all([
      fetchPlayableGameMatches(supabase),
      fetchCompletedGameMatches(supabase, 15),
    ])
    if (upcomingRes.error) {
      setLoadError(upcomingRes.error.message)
      setMatches([])
    } else {
      setMatches(upcomingRes.data)
    }
    setCompletedMatches(completedRes.error ? [] : completedRes.data)
    setLoadingMatches(false)
  }, [])

  useEffect(() => {
    trackEvent('page_view', 'predict-score')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('how') !== '1') return
    setHowModalOpen(true)
    params.delete('how')
    const qs = params.toString()
    const path = window.location.pathname
    window.history.replaceState({}, '', qs ? `${path}?${qs}` : path)
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
    loadMatches()
  }, [loadMatches])

  useEffect(() => {
    if (!user || matches.length === 0) {
      if (!user) setPredictions(new Map())
      return
    }
    const ids = matches.map((m) => m.id)
    void reloadPredictions(user.id, ids)
  }, [user, matches, reloadPredictions])

  useEffect(() => {
    setSlipByMatch((prev) => {
      const next: Record<string, SlipPick> = { ...prev }
      for (const m of matches) {
        const p = predictions.get(m.id)
        if (p) {
          next[m.id] = { winner: p.predicted_winner, margin: String(p.predicted_margin) }
        } else if (next[m.id] === undefined) {
          next[m.id] = { winner: null, margin: '' }
        }
      }
      return next
    })
  }, [matches, predictions])

  useEffect(() => {
    if (!flashSubmittedId) return
    const t = window.setTimeout(() => setFlashSubmittedId(null), 3500)
    return () => window.clearTimeout(t)
  }, [flashSubmittedId])

  useEffect(() => {
    if (!bulkSaveMsg) return
    const t = window.setTimeout(() => setBulkSaveMsg(''), 4000)
    return () => window.clearTimeout(t)
  }, [bulkSaveMsg])

  const matchIds = useMemo(() => matches.map((m) => m.id), [matches])

  const patchSlip = useCallback((matchId: string, patch: Partial<SlipPick>) => {
    setSlipByMatch((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { winner: null, margin: '' }), ...patch },
    }))
  }, [])

  const upsertPrediction = useCallback(
    async (input: {
      matchId: string
      predictedWinner: 'home' | 'away'
      predictedMargin: number
    }) => {
      if (!user) return { error: new Error('Not signed in') as Error | null }
      const profileErr = await ensureUserProfile(user)
      if (profileErr) return { error: new Error(profileErr.message) }

      const { error } = await supabase.from('user_predictions').upsert(
        {
          match_id: input.matchId,
          user_id: user.id,
          predicted_winner: input.predictedWinner,
          predicted_margin: input.predictedMargin,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,match_id' }
      )
      return { error: error ? new Error(error.message) : null }
    },
    [user]
  )

  const handleSubmitOne = async (matchId: string) => {
    if (!user) return
    const slip = slipByMatch[matchId]
    if (!slip?.winner) {
      setSubmitError('Pick a winner for this match.')
      return
    }
    const margin = parseMargin(slip.margin)
    if (margin === null) {
      setSubmitError('Enter a whole-number margin of at least 1.')
      return
    }
    setSubmitError('')
    setSubmittingMatchId(matchId)
    const { error } = await upsertPrediction({
      matchId,
      predictedWinner: slip.winner,
      predictedMargin: margin,
    })
    if (error) {
      setSubmitError(error.message)
      setSubmittingMatchId(null)
      return
    }
    await reloadPredictions(user.id, matchIds.length ? matchIds : [matchId])
    setFlashSubmittedId(matchId)
    setSubmittingMatchId(null)
  }

  const handleSubmitAll = async () => {
    if (!user) return
    const upcoming = matches.filter((m) => m.status === 'upcoming')
    const targets = upcoming.filter((m) => {
      const s = slipByMatch[m.id]
      if (!s?.winner) return false
      return parseMargin(s.margin) !== null
    })
    if (targets.length === 0) {
      setSubmitError(
        'No rows ready: add a winner and margin on at least one match you want to save. Blank rows are skipped — you do not need to fill the whole slip.'
      )
      return
    }
    setSubmitError('')
    setSubmittingAll(true)
    const profileErr = await ensureUserProfile(user)
    if (profileErr) {
      setSubmitError(profileErr.message)
      setSubmittingAll(false)
      return
    }
    let lastErr: string | null = null
    for (const m of targets) {
      const s = slipByMatch[m.id]!
      const margin = parseMargin(s.margin)!
      const { error } = await upsertPrediction({
        matchId: m.id,
        predictedWinner: s.winner!,
        predictedMargin: margin,
      })
      if (error) {
        lastErr = error.message
        break
      }
    }
    if (lastErr) {
      setSubmitError(lastErr)
    } else {
      await reloadPredictions(user.id, matchIds)
      setBulkSaveMsg(`Submitted ${targets.length} prediction(s).`)
    }
    setSubmittingAll(false)
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <div className="text-center md:text-left">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4 md:justify-start">
          <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
            Predict a Score
          </h1>
          <button
            type="button"
            onClick={() => setHowModalOpen(true)}
            className="shrink-0 rounded-2xl border-2 border-teal-950 bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-950"
          >
            How it works
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 md:mx-0">
          Pick only the matches you want — every scored prediction counts. Tap the winning school,
          enter the margin, then use <strong>Predict</strong> on that row. Use{' '}
          <strong>Submit all</strong> to save every row that already has both winner and margin;
          empty rows are skipped.{' '}
          <Link href="/profile" className="font-semibold text-teal-900 underline">
            Profile
          </Link>{' '}
          for your public name and photo. Comments live on each match page.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-teal-950 md:mx-0">
          Predict one match or many. You choose.
        </p>
      </div>

      <HowItWorksModal open={howModalOpen} onClose={() => setHowModalOpen(false)} />

      {!authReady ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading…</p>
      ) : !signedIn ? (
        <div className="mt-8 border-2 border-gray-900 bg-gray-50 px-6 py-8 text-center">
          <p className="text-base font-bold text-gray-900">
            Sign up or log in to make your prediction.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Pick any match you like after you have an account — you do not need to predict every
            fixture.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex border-2 border-teal-950 bg-teal-800 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-teal-900"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="inline-flex border-2 border-gray-900 bg-white px-8 py-3 text-sm font-bold uppercase tracking-wide text-gray-900 hover:bg-gray-100"
            >
              Log in
            </Link>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <p className="mt-8 border-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : null}

      {submitError ? (
        <p className="mt-4 border-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">
          {submitError}
        </p>
      ) : null}

      {bulkSaveMsg ? (
        <p className="mt-4 border-2 border-teal-800 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-950">
          {bulkSaveMsg}
        </p>
      ) : null}

      {loadingMatches ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading matches…</p>
      ) : matches.length === 0 && completedMatches.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-600">
          No matches yet. Add rows to <code className="text-xs">game_matches</code> in Supabase to
          test.
        </p>
      ) : (
        <>
          {matches.length > 0 ? (
            <section className="mt-10">
              <div className="inline-block bg-slate-900 px-6 py-2.5 text-base font-black uppercase tracking-wide text-white shadow-sm">
                Upcoming matches
              </div>

              <div className="md:border-2 md:border-gray-900 md:bg-white">
                <div className="mt-0 hidden border-b-2 border-gray-900 bg-teal-900 px-3 py-2 md:grid md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_6.5rem_5.5rem] md:items-center md:gap-3 md:text-[10px] md:font-bold md:uppercase md:tracking-wider md:text-white">
                  <span>Kick-off</span>
                  <span>Home</span>
                  <span>Away</span>
                  <span className="text-center">Margin</span>
                  <span className="text-center">Predict</span>
                  <span className="text-center">Comments</span>
                </div>

                <ul className="space-y-3 bg-gray-100 p-2 md:space-y-0 md:divide-y md:divide-gray-200 md:bg-white md:p-0">
                  {matches.map((match) => {
                    const slip = slipByMatch[match.id] ?? { winner: null, margin: '' }
                    const locked = match.status === 'locked'
                    const rowBusy = submittingMatchId === match.id || submittingAll
                    return (
                      <PredictionSlipRow
                        key={match.id}
                        match={match}
                        slip={slip}
                        onSlipChange={patchSlip}
                        prediction={predictions.get(match.id)}
                        signedIn={signedIn}
                        locked={locked}
                        submitting={rowBusy}
                        flashSubmitted={flashSubmittedId === match.id}
                        onPredict={handleSubmitOne}
                      />
                    )
                  })}
                </ul>
              </div>

              {signedIn ? (
                <div className="mt-4 flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={submittingAll || submittingMatchId !== null}
                    onClick={() => void handleSubmitAll()}
                    className="border-2 border-teal-950 bg-teal-800 px-6 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-teal-900 disabled:opacity-40"
                  >
                    {submittingAll ? 'Submitting…' : 'Submit all'}
                  </button>
                  <p className="max-w-md text-right text-xs text-gray-600">
                    Submit all only submits rows where you have selected a winner and entered a
                    margin. You can leave other matches blank.
                  </p>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="mt-10 text-center text-sm text-gray-600">
              No upcoming or locked fixtures. Completed results are below.
            </p>
          )}

          {completedMatches.length > 0 ? (
            <section className="mt-14">
              <div className="inline-block bg-slate-900 px-6 py-2.5 text-base font-black uppercase tracking-wide text-white shadow-sm">
                Completed matches
              </div>
              <p className="mt-3 text-sm text-gray-600">
                Rankings use total points, then margin difference (lower is better).
              </p>
              <ul className="mt-6 flex flex-col gap-6">
                {completedMatches.map((match) => (
                  <li key={match.id}>
                    <CompletedMatchLeaderboard match={match} signedIn={signedIn} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  )
}
