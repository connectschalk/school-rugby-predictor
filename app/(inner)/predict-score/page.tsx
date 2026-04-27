'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import HowItWorksModal from '@/components/HowItWorksModal'
import CompletedMatchLeaderboard from '@/components/predict-score/CompletedMatchLeaderboard'
import PredictScoreAuthModal from '@/components/predict-score/PredictScoreAuthModal'
import PredictScoreSlipListSection, {
  CLOSED_SLIP_HEADER_CLASS,
} from '@/components/predict-score/PredictScoreSlipListSection'
import { type SlipPick } from '@/components/predict-score/PredictionSlipRow'
import { canEditPredictionOnMatch, matchPredictionsClosed, matchStartsSoon } from '@/lib/prediction-cutoff'
import {
  fetchCompletedGameMatches,
  fetchPlayableGameMatches,
  fetchUserPredictionsForMatches,
  sortPlayableMatchesForPredictScore,
  type GameMatch,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import { LOCK_ALL_NO_CANDIDATES, lockAllUnlockedSavedForEditableMatches } from '@/lib/lock-user-predictions'
import { matchGameAgainstTeamSearch } from '@/lib/team-aliases-db'
import type { TeamRow } from '@/lib/team-name-match'
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
  const [playableMatches, setPlayableMatches] = useState<GameMatch[]>([])
  const [completedMatches, setCompletedMatches] = useState<GameMatch[]>([])
  const [predictions, setPredictions] = useState<Map<string, UserPredictionRow>>(
    () => new Map()
  )
  const [slipByMatch, setSlipByMatch] = useState<Record<string, SlipPick>>({})
  const [loadError, setLoadError] = useState('')
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [lockingMatchId, setLockingMatchId] = useState<string | null>(null)
  const [lockingAll, setLockingAll] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [flashSubmittedId, setFlashSubmittedId] = useState<string | null>(null)
  const [bulkSaveMsg, setBulkSaveMsg] = useState('')
  const [lockAllMsg, setLockAllMsg] = useState('')
  const [howModalOpen, setHowModalOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [teamSearch, setTeamSearch] = useState('')
  const [aliasRowsForSearch, setAliasRowsForSearch] = useState<Record<string, unknown>[]>([])
  const [teamsForSearch, setTeamsForSearch] = useState<TeamRow[]>([])
  const [nowTick, setNowTick] = useState(() => Date.now())

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
    const [upcomingRes, completedRes, aliasRes, teamsRes] = await Promise.all([
      fetchPlayableGameMatches(supabase),
      fetchCompletedGameMatches(supabase, 15),
      supabase.from('team_aliases').select('*'),
      supabase.from('teams').select('id, name'),
    ])
    if (upcomingRes.error) {
      setLoadError(upcomingRes.error.message)
      setPlayableMatches([])
    } else {
      setPlayableMatches(upcomingRes.data)
    }
    setCompletedMatches(completedRes.error ? [] : completedRes.data)
    setAliasRowsForSearch((aliasRes.data as Record<string, unknown>[]) ?? [])
    setTeamsForSearch((teamsRes.data as TeamRow[]) ?? [])
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
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!user || playableMatches.length === 0) {
      if (!user) setPredictions(new Map())
      return
    }
    const ids = playableMatches.map((m) => m.id)
    void reloadPredictions(user.id, ids)
  }, [user, playableMatches, reloadPredictions])

  useEffect(() => {
    setSlipByMatch((prev) => {
      const next: Record<string, SlipPick> = { ...prev }
      for (const m of playableMatches) {
        const p = predictions.get(m.id)
        if (p) {
          next[m.id] = { winner: p.predicted_winner, margin: String(p.predicted_margin) }
        } else if (next[m.id] === undefined) {
          next[m.id] = { winner: null, margin: '' }
        }
      }
      return next
    })
  }, [playableMatches, predictions])

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

  useEffect(() => {
    if (!lockAllMsg) return
    const t = window.setTimeout(() => setLockAllMsg(''), 4000)
    return () => window.clearTimeout(t)
  }, [lockAllMsg])

  const matchIds = useMemo(() => playableMatches.map((m) => m.id), [playableMatches])

  const filteredPlayable = useMemo(() => {
    const q = teamSearch.trim()
    if (!q) return playableMatches
    return playableMatches.filter((m) => matchGameAgainstTeamSearch(m, q, aliasRowsForSearch, teamsForSearch))
  }, [playableMatches, teamSearch, aliasRowsForSearch, teamsForSearch])

  const atDate = useMemo(() => new Date(nowTick), [nowTick])

  const { closedMatches, featuredEditable, openOtherMatches, startingSoonMatches } = useMemo(() => {
    const closed: GameMatch[] = []
    const editable: GameMatch[] = []
    for (const m of filteredPlayable) {
      if (matchPredictionsClosed(m, atDate)) closed.push(m)
      else if (canEditPredictionOnMatch(m, atDate)) editable.push(m)
    }
    const sortedEditable = sortPlayableMatchesForPredictScore(editable)
    const featured = sortedEditable.filter((m) => !!m.is_featured)
    const nonFeatured = sortedEditable.filter((m) => !m.is_featured)
    const soon: GameMatch[] = []
    const open: GameMatch[] = []
    for (const m of nonFeatured) {
      if (matchStartsSoon(m, atDate)) soon.push(m)
      else open.push(m)
    }
    return {
      closedMatches: sortPlayableMatchesForPredictScore(closed),
      featuredEditable: featured,
      openOtherMatches: open,
      startingSoonMatches: soon,
    }
  }, [filteredPlayable, atDate])

  const startsSoonIds = useMemo(() => {
    const set = new Set<string>()
    for (const m of [...featuredEditable, ...openOtherMatches, ...startingSoonMatches]) {
      if (matchStartsSoon(m, atDate)) set.add(m.id)
    }
    return set
  }, [featuredEditable, openOtherMatches, startingSoonMatches, atDate])

  const hasEditablePredictRows =
    featuredEditable.length + openOtherMatches.length + startingSoonMatches.length > 0

  const canLockAnySaved = useMemo(() => {
    const open = [...featuredEditable, ...openOtherMatches, ...startingSoonMatches]
    return open.some((m) => {
      const p = predictions.get(m.id)
      return p && !p.is_locked && canEditPredictionOnMatch(m, atDate)
    })
  }, [featuredEditable, openOtherMatches, startingSoonMatches, predictions, atDate])

  const searchActive = teamSearch.trim().length > 0
  const noSearchResults =
    searchActive && filteredPlayable.length === 0 && playableMatches.length > 0

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
    const existing = predictions.get(matchId)
    if (existing?.is_locked) {
      setSubmitError('This prediction is locked and cannot be changed.')
      return
    }
    const rowMatch = playableMatches.find((m) => m.id === matchId)
    if (!rowMatch || !canEditPredictionOnMatch(rowMatch, new Date())) {
      setSubmitError('Predictions are closed for this match.')
      return
    }
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
    const targets = playableMatches.filter((m) => canEditPredictionOnMatch(m, new Date())).filter((m) => {
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

  const handleLockOne = async (matchId: string) => {
    if (!user) return
    const pred = predictions.get(matchId)
    if (!pred?.id || pred.is_locked) return
    const rowMatch = playableMatches.find((m) => m.id === matchId)
    if (!rowMatch || !canEditPredictionOnMatch(rowMatch, new Date())) {
      setSubmitError('Predictions are closed for this match.')
      return
    }
    setSubmitError('')
    setLockingMatchId(matchId)
    const { error } = await supabase
      .from('user_predictions')
      .update({ is_locked: true, locked_at: new Date().toISOString() })
      .eq('id', pred.id)
      .eq('is_locked', false)
    if (error) {
      setSubmitError(error.message)
    } else {
      await reloadPredictions(user.id, matchIds.length ? matchIds : [matchId])
    }
    setLockingMatchId(null)
  }

  const handleLockAll = async () => {
    if (!user) return
    const open = [...featuredEditable, ...openOtherMatches, ...startingSoonMatches]
    setSubmitError('')
    setLockAllMsg('')
    setLockingAll(true)
    const { locked, error } = await lockAllUnlockedSavedForEditableMatches(
      supabase,
      open,
      predictions,
      new Date()
    )
    if (error?.message === LOCK_ALL_NO_CANDIDATES) {
      setSubmitError('No saved unlocked predictions to lock for open games.')
    } else if (error) {
      setSubmitError(error.message)
    } else {
      await reloadPredictions(user.id, matchIds)
      setLockAllMsg(`Locked ${locked} prediction(s).`)
    }
    setLockingAll(false)
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <div className="mx-auto max-w-3xl text-center">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
            Predict a Score
          </h1>
          <button
            type="button"
            onClick={() => setHowModalOpen(true)}
            className="shrink-0 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            How it works
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm leading-relaxed text-gray-500">
          You can predict one match or many. You do not have to predict every fixture. Have fun!
        </p>
      </div>

      <HowItWorksModal open={howModalOpen} onClose={() => setHowModalOpen(false)} />
      <PredictScoreAuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {!authReady ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading…</p>
      ) : !signedIn ? (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
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
              className="inline-flex rounded-xl border border-gray-900 bg-gray-900 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="inline-flex rounded-xl border border-gray-300 bg-white px-8 py-3 text-sm font-bold uppercase tracking-wide text-gray-900 hover:border-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              Log in
            </Link>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <p className="mt-8 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {loadError}
        </p>
      ) : null}

      {submitError ? (
        <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {submitError}
        </p>
      ) : null}

      {bulkSaveMsg ? (
        <p className="mt-4 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
          {bulkSaveMsg}
        </p>
      ) : null}

      {lockAllMsg ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {lockAllMsg}
        </p>
      ) : null}

      {loadingMatches ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading matches…</p>
      ) : playableMatches.length === 0 && completedMatches.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-600">
          No matches yet. Add rows to <code className="text-xs">game_matches</code> in Supabase to
          test.
        </p>
      ) : (
        <>
          {playableMatches.length > 0 ? (
            <section className="mt-10">
              <div className="mx-auto mb-4 max-w-xl text-center">
                <label className="block w-full">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                    Find a team
                  </span>
                  <input
                    type="search"
                    enterKeyHint="search"
                    placeholder="Search team..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  />
                </label>
              </div>

              {noSearchResults ? (
                <p className="mt-6 border-2 border-gray-300 bg-gray-50 px-4 py-3 text-center text-sm text-gray-700">
                  No matches found for this team.
                </p>
              ) : (
                <>
                  {!hasEditablePredictRows && closedMatches.length > 0 ? (
                    <p className="mt-6 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-center text-sm text-gray-700">
                      Nothing open for predictions here — kickoff has passed or these fixtures are
                      locked. You can still open comments below.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-col gap-10">
                  <PredictScoreSlipListSection
                    title="Featured games"
                    sectionClassName="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-3 md:p-4"
                    titleClassName="inline-flex items-center rounded-xl border border-gray-900 bg-gray-900 px-5 py-2 text-base font-black uppercase tracking-wide text-white shadow-sm shadow-black/10"
                    matches={featuredEditable}
                    startsSoonIds={startsSoonIds}
                    slipByMatch={slipByMatch}
                    predictions={predictions}
                    signedIn={signedIn}
                    submittingMatchId={submittingMatchId}
                    submittingAll={submittingAll}
                    flashSubmittedId={flashSubmittedId}
                    patchSlip={patchSlip}
                    onPredict={handleSubmitOne}
                    onLock={handleLockOne}
                    lockingMatchId={lockingMatchId}
                    onRequireAuth={() => setAuthModalOpen(true)}
                  />
                  <PredictScoreSlipListSection
                    title="Open games"
                    titleClassName="inline-flex items-center rounded-xl border border-gray-900 bg-gray-900 px-5 py-2 text-base font-black uppercase tracking-wide text-white shadow-sm shadow-black/10"
                    description="Kickoff more than 60 minutes away — predictions close at kickoff."
                    matches={openOtherMatches}
                    startsSoonIds={startsSoonIds}
                    slipByMatch={slipByMatch}
                    predictions={predictions}
                    signedIn={signedIn}
                    submittingMatchId={submittingMatchId}
                    submittingAll={submittingAll}
                    flashSubmittedId={flashSubmittedId}
                    patchSlip={patchSlip}
                    onPredict={handleSubmitOne}
                    onLock={handleLockOne}
                    lockingMatchId={lockingMatchId}
                    onRequireAuth={() => setAuthModalOpen(true)}
                  />
                  <PredictScoreSlipListSection
                    title="Starting soon"
                    titleClassName="inline-flex items-center gap-2 rounded-xl border border-red-600 bg-white px-5 py-2 text-base font-black uppercase tracking-wide text-gray-900 shadow-sm shadow-black/5"
                    description="Kickoff within 60 minutes — you can still predict until kickoff."
                    matches={startingSoonMatches}
                    startsSoonIds={startsSoonIds}
                    slipByMatch={slipByMatch}
                    predictions={predictions}
                    signedIn={signedIn}
                    submittingMatchId={submittingMatchId}
                    submittingAll={submittingAll}
                    flashSubmittedId={flashSubmittedId}
                    patchSlip={patchSlip}
                    onPredict={handleSubmitOne}
                    onLock={handleLockOne}
                    lockingMatchId={lockingMatchId}
                    onRequireAuth={() => setAuthModalOpen(true)}
                  />
                  <PredictScoreSlipListSection
                    title="Predictions closed"
                    titleClassName="inline-flex items-center rounded-xl border border-gray-300 bg-gray-100 px-5 py-2 text-base font-black uppercase tracking-wide text-gray-700"
                    description="Kickoff has passed or the match is no longer upcoming for predictions."
                    listWrapClassName="overflow-hidden rounded-2xl border border-gray-300 bg-gray-50"
                    headerClassName={CLOSED_SLIP_HEADER_CLASS}
                    matches={closedMatches}
                    startsSoonIds={startsSoonIds}
                    slipByMatch={slipByMatch}
                    predictions={predictions}
                    signedIn={signedIn}
                    submittingMatchId={submittingMatchId}
                    submittingAll={submittingAll}
                    flashSubmittedId={flashSubmittedId}
                    patchSlip={patchSlip}
                    onPredict={handleSubmitOne}
                    onLock={handleLockOne}
                    lockingMatchId={lockingMatchId}
                    onRequireAuth={() => setAuthModalOpen(true)}
                  />
                  </div>
                </>
              )}

              {hasEditablePredictRows ? (
                <div className="mt-4 flex flex-col items-end gap-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={
                        signedIn &&
                        (submittingAll ||
                          submittingMatchId !== null ||
                          lockingMatchId !== null ||
                          lockingAll)
                      }
                      onClick={() => {
                        if (!signedIn) {
                          setAuthModalOpen(true)
                          return
                        }
                        void handleSubmitAll()
                      }}
                      className="rounded-xl border border-gray-900 bg-gray-900 px-6 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-40"
                    >
                      {submittingAll ? 'Submitting…' : 'Submit all'}
                    </button>
                    {signedIn && canLockAnySaved ? (
                      <button
                        type="button"
                        disabled={
                          submittingAll ||
                          submittingMatchId !== null ||
                          lockingMatchId !== null ||
                          lockingAll
                        }
                        onClick={() => void handleLockAll()}
                        className="rounded-xl border border-red-700 bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-40"
                      >
                        {lockingAll ? 'Locking…' : 'Lock all saved predictions'}
                      </button>
                    ) : null}
                  </div>
                  <p className="max-w-md text-right text-xs text-gray-600">
                    {signedIn ? (
                      <>
                        Submit all saves open rows with a winner and margin. Lock freezes your pick
                        for Community Picks — lock all only affects games you already saved.
                      </>
                    ) : (
                      <>Log in or sign up to save predictions with Submit all.</>
                    )}
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
              <div className="inline-flex items-center rounded-xl border border-gray-900 bg-gray-900 px-5 py-2 text-base font-black uppercase tracking-wide text-white shadow-sm shadow-black/10">
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
