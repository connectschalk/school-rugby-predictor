'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import MatchCard, { MATCH_CARD_MARGIN_MAX } from '@/components/MatchCard'
import SoccerMatchCard from '@/components/competitions/SoccerMatchCard'
import ProvinceLogoMark from '@/components/ProvinceLogoMark'
import PredictScoreAuthModal from '@/components/predict-score/PredictScoreAuthModal'
import PredictionMarginModal from '@/components/predict-score/PredictionMarginModal'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { canEditPredictionOnMatch, matchPredictionsClosed } from '@/lib/prediction-cutoff'
import {
  defaultPick,
  defaultSoccerPick,
  groupByDateOnly,
  groupByProvinceThenDate,
  parseMarginFromInput,
  parseSoccerGoalsFromInput,
  predictionMap,
  upsertSoccerUserPrediction,
  upsertUserPrediction,
  type PickState,
  type SoccerPickState,
} from '@/lib/predict-score-common'
import { isSoccerExactScoreMode, type CompetitionScoringMode } from '@/lib/competitions'
import { fetchEffectivePoolMatches, fetchMyPools } from '@/lib/pools'
import {
  fetchCompetitionUpcomingMatches,
  fetchUserPredictionsForMatches,
  type GameMatch,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import {
  getProvinceLogoPath,
  matchBelongsToProvinceLogoCode,
  PROVINCE_LOGO_CODES_UI_ORDER,
  PROVINCE_LOGO_TITLES,
  PROVINCE_PREDICT_FILTER_LABEL,
  type ProvinceLogoCode,
} from '@/lib/province-logos'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

export type PredictScorePanelProps = {
  competitionId: string
  competitionSlug: string
  competitionName?: string
  scoringMode?: CompetitionScoringMode
  /** Schools-style province crest filters (custom_pool_fixtures). */
  showProvinceFilters?: boolean
}

function PredictScoreFocusHandler({ ready }: { ready: boolean }) {
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus')?.trim() ?? ''
  useEffect(() => {
    if (!ready || !focus) return
    const id = window.setTimeout(() => {
      document.getElementById(`predict-card-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    return () => window.clearTimeout(id)
  }, [ready, focus])
  return null
}

export default function PredictScorePanel({
  competitionId,
  competitionSlug,
  competitionName,
  scoringMode = 'rugby_margin',
  showProvinceFilters = true,
}: PredictScorePanelProps) {
  const soccerMode = isSoccerExactScoreMode(scoringMode)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [predictions, setPredictions] = useState<Map<string, UserPredictionRow>>(() => new Map())
  const [picksByMatch, setPicksByMatch] = useState<Record<string, PickState>>({})
  const [soccerPicksByMatch, setSoccerPicksByMatch] = useState<Record<string, SoccerPickState>>({})
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitError, setSubmitError] = useState('')
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null)
  const [lockingMatchId, setLockingMatchId] = useState<string | null>(null)
  const [flashSubmittedId, setFlashSubmittedId] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [teamSearch, setTeamSearch] = useState('')
  const [myPoolIds, setMyPoolIds] = useState<{ id: string; name: string }[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  /** Match IDs in this pool's fixture scope (RPC: groups, teams, or union when both). */
  const [poolScopeMatchIds, setPoolScopeMatchIds] = useState<Set<string>>(() => new Set())
  const [poolFilterReady, setPoolFilterReady] = useState(true)
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<ProvinceLogoCode | null>(null)
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [marginModalMatch, setMarginModalMatch] = useState<GameMatch | null>(null)

  const signedIn = !!user
  const atDate = useMemo(() => new Date(nowTick), [nowTick])

  const matchIds = useMemo(() => matches.map((m) => m.id), [matches])

  const reloadPredictions = useCallback(async (uid: string, ids: string[]) => {
    const { data, error } = await fetchUserPredictionsForMatches(supabase, uid, ids)
    if (error) {
      setLoadError(error.message)
      return
    }
    setPredictions(predictionMap(data))
  }, [])

  const loadMatches = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await fetchCompetitionUpcomingMatches(supabase, competitionId)
    if (error) {
      setLoadError(error.message)
      setMatches([])
    } else {
      setMatches(data)
    }
    setLoading(false)
  }, [competitionId])

  useEffect(() => {
    trackEvent('page_view', 'predict-score')
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
      setIsUserAdmin(false)
      return
    }
    let cancelled = false
    void (async () => {
      const { isAdmin } = await fetchUserIsAdmin(supabase, user.id)
      if (!cancelled) setIsUserAdmin(isAdmin)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!user) {
      setMyPoolIds([])
      return
    }
    void (async () => {
      const { pools } = await fetchMyPools(supabase, user.id, competitionId)
      setMyPoolIds(pools.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)))
    })()
  }, [user, competitionId])

  useEffect(() => {
    if (!selectedPoolId) {
      setPoolScopeMatchIds(new Set())
      setPoolFilterReady(true)
      return
    }
    setPoolFilterReady(false)
    let cancelled = false
    void (async () => {
      const { matchIds, error } = await fetchEffectivePoolMatches(supabase, selectedPoolId)
      if (cancelled) return
      setPoolScopeMatchIds(new Set(error ? [] : matchIds))
      setPoolFilterReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPoolId])

  useEffect(() => {
    if (!user || matches.length === 0) {
      if (!user) setPredictions(new Map())
      return
    }
    void reloadPredictions(user.id, matchIds)
  }, [user, matches, matchIds, reloadPredictions])

  useEffect(() => {
    if (soccerMode) {
      setSoccerPicksByMatch((prev) => {
        const next = { ...prev }
        for (const m of matches) {
          const p = predictions.get(m.id)
          if (p?.predicted_home_score != null && p.predicted_away_score != null) {
            next[m.id] = {
              homeGoals: String(p.predicted_home_score),
              awayGoals: String(p.predicted_away_score),
            }
          } else if (next[m.id] === undefined) {
            next[m.id] = defaultSoccerPick()
          }
        }
        return next
      })
      return
    }

    setPicksByMatch((prev) => {
      const next = { ...prev }
      for (const m of matches) {
        const p = predictions.get(m.id)
        if (
          p?.predicted_winner === 'home' ||
          p?.predicted_winner === 'away'
        ) {
          next[m.id] = { winner: p.predicted_winner, margin: String(p.predicted_margin) }
        } else if (next[m.id] === undefined) {
          next[m.id] = defaultPick()
        }
      }
      return next
    })
  }, [matches, predictions, soccerMode])

  useEffect(() => {
    if (!flashSubmittedId) return
    const t = window.setTimeout(() => setFlashSubmittedId(null), 3500)
    return () => window.clearTimeout(t)
  }, [flashSubmittedId])

  const poolHasNoConfiguredScope = useMemo(
    () => !!selectedPoolId && poolFilterReady && poolScopeMatchIds.size === 0,
    [selectedPoolId, poolFilterReady, poolScopeMatchIds]
  )

  const filteredMatches = useMemo(() => {
    let list = matches
    if (selectedPoolId) {
      if (!poolFilterReady) {
        return []
      }
      list = list.filter((m) => poolScopeMatchIds.has(m.id))
    }
    const q = teamSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (m) => m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q)
      )
    }
    if (selectedProvinceCode) {
      list = list.filter((m) =>
        matchBelongsToProvinceLogoCode(m.home_team_province, m.away_team_province, selectedProvinceCode)
      )
    }
    return list
  }, [
    matches,
    selectedPoolId,
    poolFilterReady,
    poolScopeMatchIds,
    teamSearch,
    selectedProvinceCode,
  ])

  const groupedByProvince = useMemo(() => groupByProvinceThenDate(filteredMatches), [filteredMatches])

  const provinceFilterDayGroups = useMemo(
    () => (selectedProvinceCode ? groupByDateOnly(filteredMatches) : null),
    [selectedProvinceCode, filteredMatches]
  )

  const setPick = useCallback((matchId: string, patch: Partial<PickState>) => {
    setPicksByMatch((prev) => {
      const cur = prev[matchId] ?? defaultPick()
      const merged: PickState = { ...cur, ...patch }
      if (typeof patch.margin === 'string') {
        merged.margin = patch.margin.replace(/\D/g, '').slice(0, 2)
      }
      return { ...prev, [matchId]: merged }
    })
  }, [])

  const setSoccerPick = useCallback((matchId: string, patch: Partial<SoccerPickState>) => {
    setSoccerPicksByMatch((prev) => {
      const cur = prev[matchId] ?? defaultSoccerPick()
      const merged: SoccerPickState = { ...cur, ...patch }
      if (typeof patch.homeGoals === 'string') {
        merged.homeGoals = patch.homeGoals.replace(/\D/g, '').slice(0, 2)
      }
      if (typeof patch.awayGoals === 'string') {
        merged.awayGoals = patch.awayGoals.replace(/\D/g, '').slice(0, 2)
      }
      return { ...prev, [matchId]: merged }
    })
  }, [])

  const upsertPrediction = useCallback(
    async (input: { matchId: string; predictedWinner: 'home' | 'away'; predictedMargin: number }) => {
      if (!user) return { error: new Error('Not signed in') as Error | null }
      return upsertUserPrediction(supabase, user, input)
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
    const rowMatch = matches.find((m) => m.id === matchId)
    if (!rowMatch || !canEditPredictionOnMatch(rowMatch, new Date())) {
      setSubmitError('Predictions are closed for this match.')
      return
    }

    if (soccerMode) {
      const slip = soccerPicksByMatch[matchId] ?? defaultSoccerPick()
      const homeGoals = parseSoccerGoalsFromInput(slip.homeGoals)
      const awayGoals = parseSoccerGoalsFromInput(slip.awayGoals)
      if (homeGoals === null || awayGoals === null) {
        setSubmitError('Enter home and away goals (0–20).')
        return
      }
      setSubmitError('')
      setSubmittingMatchId(matchId)
      const { error } = await upsertSoccerUserPrediction(supabase, user, {
        matchId,
        predictedHomeScore: homeGoals,
        predictedAwayScore: awayGoals,
      })
      if (error) {
        setSubmitError(error.message)
        setSubmittingMatchId(null)
        return
      }
      await reloadPredictions(user.id, matchIds.length ? matchIds : [matchId])
      setFlashSubmittedId(matchId)
      setSubmittingMatchId(null)
      return
    }

    const slip = picksByMatch[matchId]
    if (!slip?.winner) {
      setSubmitError('Pick a winner for this match.')
      return
    }
    const margin = parseMarginFromInput(slip.margin)
    if (margin === null) {
      setSubmitError(`Set a winning margin between 1 and ${MATCH_CARD_MARGIN_MAX} points.`)
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

  const handleLockOne = async (matchId: string) => {
    if (!user) return
    const pred = predictions.get(matchId)
    if (!pred?.id || pred.is_locked) return
    const rowMatch = matches.find((m) => m.id === matchId)
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

  const renderPredictMatchRow = (m: GameMatch) => {
    const pred = predictions.get(m.id)
    const closed = matchPredictionsClosed(m, atDate)
    const editable = canEditPredictionOnMatch(m, atDate)
    const rowBusy = submittingMatchId === m.id
    const showLock = signedIn && Boolean(pred?.id) && !pred?.is_locked && editable && !closed

    if (soccerMode) {
      const pick = soccerPicksByMatch[m.id] ?? defaultSoccerPick()
      return (
        <div key={m.id} id={`predict-card-${m.id}`} className="scroll-mt-24">
          <SoccerMatchCard
            competitionSlug={competitionSlug}
            homeTeam={m.home_team}
            awayTeam={m.away_team}
            kickoffTime={m.kickoff_time}
            homeGoalsInput={pick.homeGoals}
            awayGoalsInput={pick.awayGoals}
            onHomeGoalsChange={(value) => setSoccerPick(m.id, { homeGoals: value })}
            onAwayGoalsChange={(value) => setSoccerPick(m.id, { awayGoals: value })}
            matchId={m.id}
            signedIn={signedIn}
            predictionsClosed={closed}
            editable={editable}
            predictionRowLocked={Boolean(pred?.is_locked)}
            hasExistingSubmission={Boolean(pred?.id)}
            submitting={rowBusy}
            flashSubmitted={flashSubmittedId === m.id}
            lockingPick={lockingMatchId === m.id}
            onSubmit={() => void handleSubmitOne(m.id)}
            onLockPick={showLock ? () => void handleLockOne(m.id) : undefined}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        </div>
      )
    }

    const pick = picksByMatch[m.id] ?? defaultPick()
    return (
      <div key={m.id} id={`predict-card-${m.id}`} className="scroll-mt-24">
        <MatchCard
          competitionSlug={competitionSlug}
          homeTeam={m.home_team}
          awayTeam={m.away_team}
          kickoffTime={m.kickoff_time}
          winner={pick.winner}
          marginInput={pick.margin}
          onSelectWinner={(side) => setPick(m.id, { winner: side })}
          onMarginInputChange={(value) => setPick(m.id, { margin: value })}
          matchId={m.id}
          signedIn={signedIn}
          predictionsClosed={closed}
          editable={editable}
          predictionRowLocked={Boolean(pred?.is_locked)}
          hasExistingSubmission={Boolean(pred?.id)}
          submitting={rowBusy}
          flashSubmitted={flashSubmittedId === m.id}
          lockingPick={lockingMatchId === m.id}
          onSubmit={() => void handleSubmitOne(m.id)}
          onLockPick={showLock ? () => void handleLockOne(m.id) : undefined}
          onRequireAuth={() => setAuthModalOpen(true)}
          isAdmin={isUserAdmin}
          onAdminModel={isUserAdmin ? () => setMarginModalMatch(m) : undefined}
        />
      </div>
    )
  }

  return (
    <main className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 pb-20 pt-8">
      <Suspense fallback={null}>
        <PredictScoreFocusHandler ready={!loading} />
      </Suspense>
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 px-4 sm:px-6">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Predict{competitionName ? ` · ${competitionName}` : ''}
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Upcoming fixtures · search, pool or province filters, save picks
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/my-predictions"
              className="inline-flex rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              My Predictions
            </Link>
          </div>
        </header>

        <PredictScoreAuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        <PredictionMarginModal match={marginModalMatch} onClose={() => setMarginModalMatch(null)} />

        <div className="w-full max-w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-500">Search team</label>
          <input
            type="search"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            placeholder="Search team…"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Select pool</p>
            <p className="mt-1 text-[11px] text-slate-500">
              <span className="font-semibold">All</span> clears pool and province. A pool can narrow fixtures by
              selected teams or by the pool&apos;s competitions and provinces. Province crests keep games where either
              home or away province matches.
            </p>
            <div className="mt-3 flex max-w-full min-w-0 flex-wrap items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedPoolId(null)
                  setSelectedProvinceCode(null)
                }}
                title="All fixtures · clear pool and province filters"
                className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                  selectedPoolId === null && selectedProvinceCode === null
                    ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                }`}
              >
                All
              </button>
              {myPoolIds.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPoolId(p.id)}
                  className={`max-w-[200px] shrink-0 truncate rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                    selectedPoolId === p.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                  }`}
                  title={p.name}
                >
                  {p.name}
                </button>
              ))}
              <span
                className="mx-0.5 hidden h-7 w-px shrink-0 bg-slate-200 sm:block"
                aria-hidden
              />
              {showProvinceFilters ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {PROVINCE_LOGO_CODES_UI_ORDER.map((code) => {
                  const active = selectedProvinceCode === code
                  return (
                    <button
                      key={code}
                      type="button"
                      title={PROVINCE_LOGO_TITLES[code]}
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedProvinceCode((prev) => (prev === code ? null : code))
                      }
                      className={`box-border flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white p-0 transition ${
                        active
                          ? 'border-slate-900 bg-slate-100 shadow-inner ring-2 ring-slate-900/20'
                          : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- small static public assets */}
                      <img
                        src={getProvinceLogoPath(code)}
                        alt=""
                        className="h-9 w-9 object-contain object-center"
                        draggable={false}
                      />
                    </button>
                  )
                })}
              </div>
              ) : null}
            </div>
            {!signedIn ? (
              <p className="mt-3 text-xs text-slate-500">Log in to load your pools and save predictions.</p>
            ) : myPoolIds.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">You are not in any pools yet.</p>
            ) : null}
          </div>
        </div>

        {!authReady ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : !signedIn ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-bold text-slate-900">Sign in to save predictions</p>
            <p className="mt-2 text-sm text-slate-600">Browse and filter fixtures below; log in to submit picks.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-black"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
              >
                Log in
              </Link>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>
        ) : null}

        {submitError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{submitError}</p>
        ) : null}

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading fixtures…</p>
        ) : matches.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-600">
            Fixtures for this competition have not been loaded yet.
          </p>
        ) : selectedPoolId && !poolFilterReady ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading pool…</p>
        ) : filteredMatches.length === 0 ? (
          poolHasNoConfiguredScope ? (
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm">
              <p className="text-sm text-slate-700">
                This pool has no fixtures in scope yet (groups, provinces, or teams). Configure the pool under Manage
                pools, or choose <span className="font-semibold">All</span> to see every fixture.
              </p>
              <Link
                href={`/competitions/${competitionSlug}/pools/create`}
                className="mt-4 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-black"
              >
                Manage pool
              </Link>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-slate-600">
              No fixtures match your search, pool, or province filter.
            </p>
          )
        ) : selectedProvinceCode && provinceFilterDayGroups ? (
          <section className="w-full min-w-0 max-w-full space-y-4">
            <h2 className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5 border-b border-slate-200 pb-2 text-lg font-black text-slate-900">
              <ProvinceLogoMark
                label={PROVINCE_PREDICT_FILTER_LABEL[selectedProvinceCode]}
                labelOnly
                size={32}
                className="shrink-0 shadow-sm"
              />
              <span className="min-w-0 break-words leading-tight">
                {PROVINCE_PREDICT_FILTER_LABEL[selectedProvinceCode]} fixtures: {filteredMatches.length}
              </span>
            </h2>
            {provinceFilterDayGroups.map((day) => (
              <div key={day.dateKey} className="min-w-0 max-w-full space-y-3">
                <h3 className="min-w-0 break-words text-sm font-semibold text-slate-500">{day.label}</h3>
                <div className="mb-1 hidden overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 md:block">
                  <div className="grid min-w-[640px] grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem_4.25rem_6.5rem] items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    <span>Kickoff</span>
                    <span>Home</span>
                    <span>Away</span>
                    <span className="text-center">Mgn</span>
                    <span className="text-center">Save</span>
                    <span className="text-center">Admin</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {day.matches.map((m) => renderPredictMatchRow(m))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          groupedByProvince.map((block) => (
            <section key={block.province} className="w-full min-w-0 max-w-full space-y-4">
              <h2 className="flex min-w-0 max-w-full items-center gap-2.5 border-b border-slate-200 pb-2 text-lg font-black text-slate-900">
                <ProvinceLogoMark label={block.province} labelOnly size={32} className="shrink-0 shadow-sm" />
                <span className="min-w-0 break-words leading-tight">{block.province}</span>
              </h2>
              {block.dates.map((day) => (
                <div key={day.dateKey} className="min-w-0 max-w-full space-y-3">
                  <h3 className="min-w-0 break-words text-sm font-semibold text-slate-500">{day.label}</h3>
                  <div className="mb-1 hidden overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 md:block">
                    <div className="grid min-w-[640px] grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem_4.25rem_6.5rem] items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      <span>Kickoff</span>
                      <span>Home</span>
                      <span>Away</span>
                      <span className="text-center">Mgn</span>
                      <span className="text-center">Save</span>
                      <span className="text-center">Admin</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {day.matches.map((m) => renderPredictMatchRow(m))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </main>
  )
}
