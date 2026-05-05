'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTeamLogo, RugbyBallIcon } from '@/components/export/team-logo'
import {
  actualPointMargin,
  actualWinnerFromScores,
  browserTokenStorageKey,
  getOrCreateBrowserToken,
  rankPredictionsForResults,
  type OneMatchPredictionRow,
} from '@/lib/one-match-challenge'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'
import { supabase } from '@/lib/supabase'
import { getLightTint, getTeamColor } from '@/lib/teamColors'

type GameMatchEmbed = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
}

type ChallengeRow = {
  id: string
  slug: string
  match_id: string
  game_matches: GameMatchEmbed | GameMatchEmbed[] | null
}

type Panel = 'predict' | 'preview' | 'results'

function unwrapGm(row: ChallengeRow): GameMatchEmbed | null {
  const g = row.game_matches
  if (Array.isArray(g)) return g[0] ?? null
  return g
}

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function winnerLabel(m: GameMatchEmbed, side: 'home' | 'away') {
  return side === 'home' ? m.home_team : m.away_team
}

function teamLogoSrc(teamName: string): string {
  return getSchoolTeamLogoPath(teamName) ?? getTeamLogo(teamName)
}

function TeamCrestImg({ teamName, className = 'h-11 w-11' }: { teamName: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!teamName.trim() || failed) {
    return <RugbyBallIcon className={`shrink-0 text-gray-700 ${className}`} />
  }
  return (
    <img
      src={teamLogoSrc(teamName)}
      alt=""
      className={`shrink-0 object-contain ${className}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function podiumGroups(ranked: ReturnType<typeof rankPredictionsForResults>) {
  const correctRanks = [...new Set(ranked.filter((r) => r.correct).map((r) => r.rank))].sort((a, b) => a - b)
  const topRanks = correctRanks.slice(0, 3)
  return topRanks.map((rank) => ({
    rank,
    rows: ranked.filter((r) => r.correct && r.rank === rank),
  }))
}

export default function OneMatchChallengePage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

  const [challenge, setChallenge] = useState<ChallengeRow | null>(null)
  const [predictions, setPredictions] = useState<OneMatchPredictionRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [predictionsLoadError, setPredictionsLoadError] = useState('')
  const [busy, setBusy] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [duplicateHint, setDuplicateHint] = useState(false)
  const [locking, setLocking] = useState(false)
  const [lockError, setLockError] = useState('')
  const [panel, setPanel] = useState<Panel>('predict')
  const [nowTick, setNowTick] = useState(() => Date.now())

  const [name, setName] = useState('')
  const [winner, setWinner] = useState<'home' | 'away' | ''>('')
  const [margin, setMargin] = useState('')
  const [myBrowserToken, setMyBrowserToken] = useState('')

  const match = challenge ? unwrapGm(challenge) : null

  const loadAll = useCallback(async () => {
    if (!slug) {
      setChallenge(null)
      setLoadError('Missing link.')
      setBusy(false)
      return
    }
    setBusy(true)
    setLoadError('')
    setPredictionsLoadError('')
    const { data: ch, error: chErr } = await supabase
      .from('one_match_challenges')
      .select(
        'id, slug, match_id, game_matches ( id, home_team, away_team, kickoff_time, status, home_score, away_score )'
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (chErr) {
      setLoadError(chErr.message)
      setChallenge(null)
      setPredictions([])
      setBusy(false)
      return
    }
    if (!ch) {
      setChallenge(null)
      setPredictions([])
      setLoadError('This challenge is not available.')
      setBusy(false)
      return
    }

    const row = ch as ChallengeRow
    setChallenge(row)

    const browserToken =
      typeof window !== 'undefined' ? window.localStorage.getItem(browserTokenStorageKey(slug))?.trim() ?? '' : ''
    const tokenForRpc =
      browserToken.length >= 8 ? browserToken : typeof window !== 'undefined' ? getOrCreateBrowserToken(slug) : ''
    if (tokenForRpc) setMyBrowserToken(tokenForRpc)

    const { data: preds, error: pErr } = await supabase.rpc('get_one_match_predictions_visible', {
      p_challenge_slug: slug,
      p_browser_token: tokenForRpc,
    })

    if (pErr) {
      setPredictionsLoadError(pErr.message)
      setPredictions([])
    } else {
      const list = (preds as OneMatchPredictionRow[]) ?? []
      setPredictions(list)
      setPredictionsLoadError('')
      const mine = tokenForRpc.length >= 8 ? list.find((p) => p.browser_token === tokenForRpc) : undefined
      if (mine) {
        setName(mine.display_name)
        setWinner(mine.predicted_winner === 'away' ? 'away' : 'home')
        setMargin(String(mine.predicted_margin))
        setDuplicateHint(false)
        if (mine.is_locked) setPanel('preview')
      }
    }
    setBusy(false)
  }, [slug])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    setDuplicateHint(false)
  }, [slug])

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!slug || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(browserTokenStorageKey(slug))?.trim() ?? ''
    if (raw.length >= 8) {
      setMyBrowserToken(raw)
    } else {
      getOrCreateBrowserToken(slug)
      setMyBrowserToken(window.localStorage.getItem(browserTokenStorageKey(slug)) ?? '')
    }
  }, [slug, predictions])

  useEffect(() => {
    if (!match || !slug) return
    const token = (typeof window !== 'undefined' ? window.localStorage.getItem(browserTokenStorageKey(slug)) : '') ?? ''
    if (token.length < 8) return
    const mine = predictions.find((p) => p.browser_token === token)
    if (mine) {
      setName(mine.display_name)
      setWinner(mine.predicted_winner)
      setMargin(String(mine.predicted_margin))
    }
  }, [match, predictions, slug])

  const predictionsOpen = useMemo(() => {
    if (!match) return false
    if (match.status === 'completed' || match.status === 'cancelled') return false
    if (match.status !== 'upcoming' && match.status !== 'locked') return false
    return new Date(match.kickoff_time).getTime() > nowTick
  }, [match, nowTick])

  const resultsAvailable = useMemo(() => {
    if (!match) return false
    if (match.status !== 'completed') return false
    if (match.home_score == null || match.away_score == null) return false
    return true
  }, [match])

  const myPrediction = useMemo(() => {
    if (myBrowserToken.length < 8) return undefined
    return predictions.find((p) => p.browser_token === myBrowserToken)
  }, [predictions, myBrowserToken])

  const iLocked = myPrediction?.is_locked === true

  const lockedPreviewPredictions = useMemo(
    () => predictions.filter((p) => p.is_locked),
    [predictions]
  )

  const ranked = useMemo(() => {
    if (!match || !resultsAvailable) return []
    const w = actualWinnerFromScores(match.home_score, match.away_score)
    if (!w) return []
    const actualM = actualPointMargin(match.home_score!, match.away_score!, w)
    const committed = predictions.filter((p) => p.is_locked)
    return rankPredictionsForResults(committed, w, actualM)
  }, [match, predictions, resultsAvailable])

  const podium = useMemo(() => podiumGroups(ranked), [ranked])

  async function onLock() {
    setLockError('')
    if (!slug || !predictionsOpen) return
    const browserToken = getOrCreateBrowserToken(slug)
    if (!predictions.some((p) => p.browser_token === browserToken)) {
      setLockError('Save your prediction first.')
      return
    }
    setLocking(true)
    try {
      const { error } = await supabase.rpc('lock_one_match_prediction', {
        p_challenge_slug: slug,
        p_browser_token: browserToken,
      })
      if (error) {
        const m = error.message.toLowerCase()
        if (m.includes('predictions closed') || m.includes('challenge not found')) {
          setLockError('Predictions closed')
        } else if (m.includes('no prediction')) {
          setLockError('Save your prediction first.')
        } else {
          setLockError(error.message)
        }
        setLocking(false)
        return
      }
      await loadAll()
      setPanel('preview')
    } catch {
      setLockError('Network error. Try again.')
    }
    setLocking(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setDuplicateHint(false)
    setLockError('')
    if (!slug) return
    if (iLocked) {
      setSubmitError('Your prediction is locked and cannot be changed.')
      return
    }
    const m = Number(margin)
    if (!name.trim()) {
      setSubmitError('Please enter your name.')
      return
    }
    if (winner !== 'home' && winner !== 'away') {
      setSubmitError('Choose the team you think will win.')
      return
    }
    if (!Number.isFinite(m) || m < 1 || m > 200) {
      setSubmitError('Enter a winning margin between 1 and 200.')
      return
    }
    const browserToken = getOrCreateBrowserToken(slug)
    setSubmitting(true)
    try {
      const res = await fetch('/api/one-match/upsert-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_slug: slug,
          browser_token: browserToken,
          display_name: name.trim(),
          predicted_winner: winner,
          predicted_margin: m,
        }),
      })
      const json = (await res.json()) as { error?: string; duplicate_name_ip_hint?: boolean }
      if (!res.ok) {
        setSubmitError(json.error ?? 'Could not save.')
        setSubmitting(false)
        return
      }
      if (json.duplicate_name_ip_hint) {
        setDuplicateHint(true)
      } else {
        setDuplicateHint(false)
      }
      await loadAll()
    } catch {
      setSubmitError('Network error. Try again.')
    }
    setSubmitting(false)
  }

  if (busy) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] px-4 py-10 text-center text-sm text-gray-600">Loading…</div>
    )
  }

  if (!match || loadError) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] px-4 py-16 text-center">
        <Image src="/nextplay-predictor.png" alt="School Rugby Predictor" width={160} height={48} className="mx-auto h-auto w-40" />
        <p className="mt-8 text-gray-700">{loadError || 'Challenge not found.'}</p>
        <Link href="/predict-score" className="mt-6 inline-block text-sm font-semibold text-red-800 underline">
          Go to Predict a Score
        </Link>
      </div>
    )
  }

  const hasSavedPrediction =
    myBrowserToken.length >= 8 && predictions.some((p) => p.browser_token === myBrowserToken)
  const predictLabel = iLocked ? '🔒 Prediction locked' : hasSavedPrediction ? 'Update' : 'Predict'
  const formDisabled = !predictionsOpen || iLocked

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f7f9] text-gray-900">
      <div className="mx-auto min-w-0 max-w-lg space-y-4 px-4 py-8 pb-16">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-2 pt-6 pb-4 text-center">
          <div className="rounded-lg bg-white px-4 py-2">
            <Link href="/" className="cursor-pointer transition hover:opacity-80">
              <Image src="/nextplay-predictor.png" alt="School Rugby Predictor" width={200} height={60} priority className="h-10 w-auto object-contain sm:h-12" />
            </Link>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">One match challenge</p>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200/80 bg-gradient-to-b from-white to-gray-50 p-5 shadow-md">
          <div className="flex items-start justify-center gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div className="flex h-[5.125rem] w-[5.125rem] items-center justify-center rounded-full border border-gray-200 bg-white/80 sm:h-[5.75rem] sm:w-[5.75rem]">
                <TeamCrestImg teamName={match.home_team} className="h-[3.6rem] w-[3.6rem] sm:h-16 sm:w-16" />
              </div>
              <p className="w-full text-center text-xs font-bold leading-tight text-gray-900 sm:text-sm">{match.home_team}</p>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center self-center pt-2 sm:pt-4">
              <span className="text-[10px] font-medium uppercase tracking-tight text-gray-400 sm:text-[11px]">vs</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div className="flex h-[5.125rem] w-[5.125rem] items-center justify-center rounded-full border border-gray-200 bg-white/80 sm:h-[5.75rem] sm:w-[5.75rem]">
                <TeamCrestImg teamName={match.away_team} className="h-[3.6rem] w-[3.6rem] sm:h-16 sm:w-16" />
              </div>
              <p className="w-full text-center text-xs font-bold leading-tight text-gray-900 sm:text-sm">{match.away_team}</p>
            </div>
          </div>
          <p className="mt-5 text-center text-sm font-medium text-gray-500">{formatKickoff(match.kickoff_time)}</p>
          {!predictionsOpen ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">Predictions closed</p>
          ) : null}
        </div>

        {predictionsLoadError ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900">
            Could not load predictions: {predictionsLoadError}
          </p>
        ) : null}

        <div className="inline-flex w-full min-w-0 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            className={`min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all duration-150 sm:px-3 ${
              panel === 'predict' ? 'bg-black text-white shadow-sm' : 'bg-transparent text-gray-600'
            }`}
            onClick={() => setPanel('predict')}
          >
            Predict
          </button>
          <button
            type="button"
            className={`min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all duration-150 sm:px-3 ${
              panel === 'preview' ? 'bg-black text-white shadow-sm' : 'bg-transparent text-gray-600'
            }`}
            onClick={() => setPanel('preview')}
          >
            Preview predictions
          </button>
          <button
            type="button"
            disabled={!resultsAvailable}
            className={`min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold transition-all duration-150 sm:px-3 ${
              panel === 'results' ? 'bg-black text-white shadow-sm' : 'bg-transparent text-gray-600'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={() => resultsAvailable && setPanel('results')}
          >
            Results
          </button>
        </div>

        {panel === 'predict' ? (
          <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {submitError ? <p className="text-sm font-medium text-red-700">{submitError}</p> : null}
            {lockError ? <p className="text-sm font-medium text-red-700">{lockError}</p> : null}
            {iLocked && myPrediction ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">🔒 Prediction locked</p>
                <p className="mt-2 text-sm text-gray-600">
                  You picked:{' '}
                  <span className="font-semibold text-gray-900">
                    {winnerLabel(match, myPrediction.predicted_winner)} by {myPrediction.predicted_margin}
                  </span>
                </p>
                {predictionsOpen ? (
                  <p className="mt-2 text-xs text-gray-500">Open Preview to see what others picked.</p>
                ) : null}
              </div>
            ) : null}
            {duplicateHint && !myPrediction ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
                You may already have predicted. Update your existing prediction if this is you.
              </p>
            ) : null}
            <div className={iLocked ? 'pointer-events-none opacity-60' : ''}>
              <label className="block text-sm font-semibold text-gray-800">Your name</label>
              <input
                className="mt-1.5 w-full rounded-xl border-0 bg-gray-50 px-4 py-3 text-base transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-black"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={formDisabled}
              />
            </div>
            <div className={iLocked ? 'pointer-events-none opacity-60' : ''}>
              <p className="text-sm font-semibold text-gray-800">Winning team</p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={formDisabled}
                  onClick={() => setWinner('home')}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-4 text-left text-sm font-semibold transition-all duration-150 ${
                    winner === 'home'
                      ? 'scale-[1.02] border-black bg-black text-white shadow-md'
                      : 'border-gray-200 bg-white'
                  } disabled:opacity-50`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-white ${
                      winner === 'home' ? 'border-white/30 bg-white/15' : 'border-gray-200'
                    }`}
                  >
                    <TeamCrestImg teamName={match.home_team} className="h-9 w-9" />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{match.home_team}</span>
                </button>
                <button
                  type="button"
                  disabled={formDisabled}
                  onClick={() => setWinner('away')}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-4 text-left text-sm font-semibold transition-all duration-150 ${
                    winner === 'away'
                      ? 'scale-[1.02] border-black bg-black text-white shadow-md'
                      : 'border-gray-200 bg-white'
                  } disabled:opacity-50`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-white ${
                      winner === 'away' ? 'border-white/30 bg-white/15' : 'border-gray-200'
                    }`}
                  >
                    <TeamCrestImg teamName={match.away_team} className="h-9 w-9" />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{match.away_team}</span>
                </button>
              </div>
            </div>
            <div className={iLocked ? 'pointer-events-none opacity-60' : ''}>
              <label className="block text-sm font-semibold text-gray-800">Winning margin (points)</label>
              <input
                type="number"
                min={1}
                max={200}
                className="mt-1.5 w-full rounded-xl border-0 bg-gray-50 py-4 text-center text-2xl font-semibold tabular-nums transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-black"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                disabled={formDisabled}
              />
            </div>
            <button
              type="submit"
              disabled={formDisabled || submitting}
              className="w-full rounded-xl bg-red-600 py-4 text-sm font-semibold text-white shadow-md transition-all duration-150 hover:scale-[1.01] hover:bg-red-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? 'Saving…' : predictLabel}
            </button>
            <button
              type="button"
              disabled={!predictionsOpen || !hasSavedPrediction || iLocked || locking || submitting}
              onClick={() => void onLock()}
              className="w-full rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-150 hover:scale-[1.01] hover:bg-gray-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100"
            >
              {locking ? 'Locking…' : '🔒 Lock in prediction'}
            </button>
          </form>
        ) : null}

        {panel === 'preview' ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            {!iLocked && predictionsOpen ? (
              <p className="py-6 text-center text-sm text-gray-500">Lock in your prediction to see what others picked.</p>
            ) : null}
            {!iLocked && !predictionsOpen ? (
              <p className="py-6 text-center text-sm font-medium text-amber-900">Predictions closed</p>
            ) : null}
            {iLocked ? (
              <div className="space-y-3">
                {lockedPreviewPredictions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">No locked predictions yet.</p>
                ) : (
                  lockedPreviewPredictions.map((p) => {
                    const isMe = p.browser_token === myBrowserToken
                    const selectedTeamName = p.predicted_winner === 'home' ? match.home_team : match.away_team
                    const selectedTeamColor = isMe ? getTeamColor(selectedTeamName) : undefined
                    return (
                      <div
                        key={p.id}
                        className={`flex min-w-0 items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm shadow-sm transition-all duration-150 ${
                          isMe ? 'border border-red-200 bg-red-50' : 'border border-gray-100 bg-white'
                        }`}
                        style={
                          isMe && selectedTeamColor
                            ? {
                                backgroundColor: getLightTint(selectedTeamColor),
                                borderColor: `${selectedTeamColor}40`,
                              }
                            : undefined
                        }
                      >
                        <span className="min-w-0 truncate font-semibold text-gray-900">{p.display_name}</span>
                        <span className="shrink-0 text-right text-gray-600">
                          <span className="font-medium text-gray-800">{winnerLabel(match, p.predicted_winner)}</span>
                          <span className="text-gray-400"> · </span>
                          <span className="tabular-nums text-gray-800">{p.predicted_margin}</span>
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {panel === 'results' && resultsAvailable ? (
          <div className="space-y-6">
            {actualWinnerFromScores(match.home_score, match.away_score) === null ? (
              <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white p-6 text-center shadow-md">
                <p className="text-sm font-medium text-gray-600">
                  This match ended in a draw. There is no winner ranking.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white p-6 text-center shadow-md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-3">
                  {(podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium).map((tier, idx) => {
                    const labelOrder = podium.length === 3 ? ['2nd', '1st', '3rd'] : ['1st', '2nd', '3rd']
                    const heights = podium.length === 3 ? ['h-28', 'h-40', 'h-24'] : ['h-32', 'h-36', 'h-28']
                    const h = heights[idx] ?? 'h-28'
                    const label = labelOrder[idx] ?? `${idx + 1}`
                    const isFirst = label === '1st'
                    return (
                      <div
                        key={`${tier.rank}-${label}`}
                        className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm"
                      >
                        <p
                          className={`text-center font-bold uppercase tracking-wide text-gray-500 ${
                            isFirst ? 'text-sm' : 'text-xs'
                          }`}
                        >
                          {label}
                        </p>
                        <div className={`mt-3 flex flex-col justify-end rounded-xl bg-gradient-to-b from-red-50/80 to-white ${h}`}>
                          {tier.rows.map((r) => (
                            <div key={r.id} className="border-t border-gray-100 px-2 py-2 text-center first:border-t-0">
                              <p
                                className={`font-semibold text-gray-900 ${
                                  isFirst ? 'text-base sm:text-lg' : 'text-sm'
                                }`}
                              >
                                {r.display_name}
                              </p>
                              <p className={`text-gray-500 ${isFirst ? 'text-sm' : 'text-xs'}`}>
                                {winnerLabel(match, r.predicted_winner)} by {r.predicted_margin}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {podium.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">No one picked the winning team.</p>
                ) : null}
                <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200/80 bg-white text-left shadow-sm">
                  <p className="border-b border-gray-100 bg-gray-50/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Full ranking
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="px-4 py-2.5 font-semibold">#</th>
                          <th className="px-4 py-2.5 font-semibold">Name</th>
                          <th className="px-4 py-2.5 font-semibold">Pick</th>
                          <th className="px-4 py-2.5 font-semibold">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranked.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 transition-colors duration-150">
                            <td className="px-4 py-2.5 tabular-nums text-gray-600">{r.rank}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{r.display_name}</td>
                            <td className="px-4 py-2.5 text-gray-600">
                              {winnerLabel(match, r.predicted_winner)}
                              {!r.correct ? <span className="ml-1 text-xs text-gray-400">(wrong)</span> : null}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-gray-700">{r.predicted_margin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
