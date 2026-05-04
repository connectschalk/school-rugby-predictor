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
  const [busy, setBusy] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [duplicateHint, setDuplicateHint] = useState(false)
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

    const { data: preds, error: pErr } = await supabase
      .from('one_match_predictions')
      .select('id, challenge_id, display_name, predicted_winner, predicted_margin, browser_token, ip_hash, created_at, updated_at')
      .eq('challenge_id', row.id)
      .order('created_at', { ascending: true })

    if (pErr) {
      setLoadError(pErr.message)
      setPredictions([])
    } else {
      setPredictions((preds as OneMatchPredictionRow[]) ?? [])
    }
    setBusy(false)
  }, [slug])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!slug || typeof window === 'undefined') return
    getOrCreateBrowserToken(slug)
    setMyBrowserToken(window.localStorage.getItem(browserTokenStorageKey(slug)) ?? '')
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

  const ranked = useMemo(() => {
    if (!match || !resultsAvailable) return []
    const w = actualWinnerFromScores(match.home_score, match.away_score)
    if (!w) return []
    const actualM = actualPointMargin(match.home_score!, match.away_score!, w)
    return rankPredictionsForResults(predictions, w, actualM)
  }, [match, predictions, resultsAvailable])

  const podium = useMemo(() => podiumGroups(ranked), [ranked])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    setDuplicateHint(false)
    if (!slug) return
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
  const predictLabel = hasSavedPrediction ? 'Update' : 'Predict'

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-gray-900">
      <div className="mx-auto max-w-lg px-4 py-8 pb-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/nextplay-predictor.png" alt="School Rugby Predictor" width={200} height={60} priority className="h-auto w-48" />
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">One match challenge</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-center gap-3 sm:gap-5">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-gray-200 bg-gray-50 sm:h-20 sm:w-20">
                <TeamCrestImg teamName={match.home_team} className="h-[3.25rem] w-[3.25rem] sm:h-14 sm:w-14" />
              </div>
              <p className="w-full text-center text-xs font-bold leading-tight text-gray-900 sm:text-sm">{match.home_team}</p>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center pt-8 sm:pt-10">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">vs</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-gray-200 bg-gray-50 sm:h-20 sm:w-20">
                <TeamCrestImg teamName={match.away_team} className="h-[3.25rem] w-[3.25rem] sm:h-14 sm:w-14" />
              </div>
              <p className="w-full text-center text-xs font-bold leading-tight text-gray-900 sm:text-sm">{match.away_team}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-gray-600">{formatKickoff(match.kickoff_time)}</p>
          {!predictionsOpen ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">Predictions are closed.</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold sm:flex-none ${
              panel === 'predict' ? 'bg-black text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-800'
            }`}
            onClick={() => setPanel('predict')}
          >
            Predict
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold sm:flex-none ${
              panel === 'preview' ? 'bg-black text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-800'
            }`}
            onClick={() => setPanel('preview')}
          >
            Preview predictions
          </button>
          <button
            type="button"
            disabled={!resultsAvailable}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold sm:flex-none ${
              panel === 'results' ? 'bg-black text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-800'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={() => resultsAvailable && setPanel('results')}
          >
            Results
          </button>
        </div>

        {panel === 'predict' ? (
          <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
            {duplicateHint ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                You may already have predicted. Update your existing prediction if this is you.
              </p>
            ) : null}
            <div>
              <label className="block text-sm font-medium text-gray-700">Your name</label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                disabled={!predictionsOpen}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Winning team</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!predictionsOpen}
                  onClick={() => setWinner('home')}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                    winner === 'home' ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'
                  } disabled:opacity-50`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white">
                    <TeamCrestImg teamName={match.home_team} className="h-9 w-9" />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{match.home_team}</span>
                </button>
                <button
                  type="button"
                  disabled={!predictionsOpen}
                  onClick={() => setWinner('away')}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                    winner === 'away' ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'
                  } disabled:opacity-50`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white">
                    <TeamCrestImg teamName={match.away_team} className="h-9 w-9" />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{match.away_team}</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Winning margin (points)</label>
              <input
                type="number"
                min={1}
                max={200}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                disabled={!predictionsOpen}
              />
            </div>
            <button
              type="submit"
              disabled={!predictionsOpen || submitting}
              className="w-full rounded-xl bg-red-700 py-3.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : predictLabel}
            </button>
          </form>
        ) : null}

        {panel === 'preview' ? (
          <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Winner</th>
                    <th className="px-4 py-3 font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No predictions yet.
                      </td>
                    </tr>
                  ) : (
                    predictions.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="px-4 py-2.5">{p.display_name}</td>
                        <td className="px-4 py-2.5">{winnerLabel(match, p.predicted_winner)}</td>
                        <td className="px-4 py-2.5">{p.predicted_margin}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {panel === 'results' && resultsAvailable ? (
          <div className="mt-8 space-y-6">
            {actualWinnerFromScores(match.home_score, match.away_score) === null ? (
              <p className="rounded-2xl border border-gray-200 bg-white p-5 text-center text-sm text-gray-700">
                This match ended in a draw. There is no winner ranking.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-3">
                  {(podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium).map((tier, idx) => {
                    const labelOrder = podium.length === 3 ? ['2nd', '1st', '3rd'] : ['1st', '2nd', '3rd']
                    const heights = podium.length === 3 ? ['h-28', 'h-40', 'h-24'] : ['h-32', 'h-36', 'h-28']
                    const h = heights[idx] ?? 'h-28'
                    const label = labelOrder[idx] ?? `${idx + 1}`
                    return (
                      <div
                        key={`${tier.rank}-${label}`}
                        className="flex min-w-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <p className="text-center text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
                        <div className={`mt-3 flex flex-col justify-end rounded-lg bg-gradient-to-b from-red-50 to-white ${h}`}>
                          {tier.rows.map((r) => (
                            <div key={r.id} className="border-t border-gray-100 px-2 py-2 text-center first:border-t-0">
                              <p className="font-semibold text-gray-900">{r.display_name}</p>
                              <p className="text-xs text-gray-600">
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
                  <p className="text-center text-sm text-gray-600">No one picked the winning team.</p>
                ) : null}
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Full ranking
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-600">
                          <th className="px-4 py-2 font-medium">#</th>
                          <th className="px-4 py-2 font-medium">Name</th>
                          <th className="px-4 py-2 font-medium">Pick</th>
                          <th className="px-4 py-2 font-medium">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranked.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100">
                            <td className="px-4 py-2">{r.rank}</td>
                            <td className="px-4 py-2">{r.display_name}</td>
                            <td className="px-4 py-2">
                              {winnerLabel(match, r.predicted_winner)}
                              {!r.correct ? <span className="ml-1 text-xs text-gray-400">(wrong)</span> : null}
                            </td>
                            <td className="px-4 py-2">{r.predicted_margin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
