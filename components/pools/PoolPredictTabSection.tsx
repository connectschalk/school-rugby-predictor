'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import MatchCard from '@/components/MatchCard'
import SoccerMatchCard, { SOCCER_PREDICT_HEADER_GRID } from '@/components/competitions/SoccerMatchCard'
import ProvinceLogoMark from '@/components/ProvinceLogoMark'
import PredictScoreAuthModal from '@/components/predict-score/PredictScoreAuthModal'
import PredictionMarginModal from '@/components/predict-score/PredictionMarginModal'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import {
  defaultPick,
  defaultSoccerPick,
  groupByProvinceThenDate,
  hasSoccerPredictionSubmission,
  parseMarginFromInput,
  parseSoccerGoalsFromInput,
  predictionMap,
  PREDICT_SCORE_MARGIN_MAX,
  soccerPickFromPrediction,
  upsertSoccerUserPrediction,
  upsertUserPrediction,
  type PickState,
  type SoccerPickState,
} from '@/lib/predict-score-common'
import { isSoccerExactScoreMode, resolveCompetitionScoringMode, type CompetitionScoringMode } from '@/lib/competitions'
import { canEditPredictionOnMatch, matchPredictionsClosed, PREDICTION_KICKOFF_LOCK_MESSAGE } from '@/lib/prediction-cutoff'
import {
  fetchUpcomingPredictScoreMatches,
  fetchUserPredictionsForMatches,
  type GameMatch,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import { supabase } from '@/lib/supabase'

export default function PoolPredictTabSection({
  effectiveMatchIds,
  user,
  competitionSlug,
  scoringMode = 'rugby_margin',
}: {
  effectiveMatchIds: string[]
  user: User
  competitionSlug?: string | null
  scoringMode?: CompetitionScoringMode
}) {
  const slug = competitionSlug ?? ''
  const scoringModeResolved = resolveCompetitionScoringMode(slug, scoringMode)
  const soccerMode = isSoccerExactScoreMode(scoringModeResolved)
  const [upcoming, setUpcoming] = useState<GameMatch[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [predictions, setPredictions] = useState<Map<string, UserPredictionRow>>(() => new Map())
  const [picksByMatch, setPicksByMatch] = useState<Record<string, PickState>>({})
  const [soccerPicksByMatch, setSoccerPicksByMatch] = useState<Record<string, SoccerPickState>>({})
  const [submitError, setSubmitError] = useState('')
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null)
  const [lockingMatchId, setLockingMatchId] = useState<string | null>(null)
  const [flashSubmittedId, setFlashSubmittedId] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [marginModalMatch, setMarginModalMatch] = useState<GameMatch | null>(null)

  const scopeIdSet = useMemo(() => new Set(effectiveMatchIds.filter(Boolean)), [effectiveMatchIds])
  const atDate = useMemo(() => new Date(nowTick), [nowTick])

  const poolMatches = useMemo(() => {
    return upcoming.filter((m) => scopeIdSet.has(m.id))
  }, [upcoming, scopeIdSet])

  const matchIds = useMemo(() => poolMatches.map((m) => m.id), [poolMatches])

  const reloadPredictions = useCallback(async (uid: string, ids: string[]) => {
    const { data, error } = await fetchUserPredictionsForMatches(supabase, uid, ids)
    if (error) {
      setLoadError(error.message)
      return
    }
    setPredictions(predictionMap(data))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    void (async () => {
      const { data, error } = await fetchUpcomingPredictScoreMatches(supabase)
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        setUpcoming([])
      } else {
        setUpcoming(data)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { isAdmin } = await fetchUserIsAdmin(supabase, user.id)
      if (!cancelled) setIsUserAdmin(isAdmin)
    })()
    return () => {
      cancelled = true
    }
  }, [user.id])

  useEffect(() => {
    if (matchIds.length === 0) {
      setPredictions(new Map())
      return
    }
    void reloadPredictions(user.id, matchIds)
  }, [user.id, matchIds, reloadPredictions])

  useEffect(() => {
    if (soccerMode) {
      setSoccerPicksByMatch((prev) => {
        const next = { ...prev }
        const at = new Date(nowTick)
        for (const m of poolMatches) {
          const p = predictions.get(m.id)
          const closed = matchPredictionsClosed(m, at)
          if (hasSoccerPredictionSubmission(p)) {
            next[m.id] = soccerPickFromPrediction(p, closed)
          } else if (closed) {
            next[m.id] = soccerPickFromPrediction(undefined, true)
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
      for (const m of poolMatches) {
        const p = predictions.get(m.id)
        if (p?.predicted_winner === 'home' || p?.predicted_winner === 'away') {
          next[m.id] = { winner: p.predicted_winner, margin: String(p.predicted_margin ?? '') }
        } else if (next[m.id] === undefined) {
          next[m.id] = defaultPick()
        }
      }
      return next
    })
  }, [poolMatches, predictions, soccerMode, nowTick])

  useEffect(() => {
    if (!flashSubmittedId) return
    const t = window.setTimeout(() => setFlashSubmittedId(null), 3500)
    return () => window.clearTimeout(t)
  }, [flashSubmittedId])

  const grouped = useMemo(() => groupByProvinceThenDate(poolMatches), [poolMatches])

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

  const handleSubmitOne = async (matchId: string) => {
    const existing = predictions.get(matchId)
    if (existing?.is_locked) {
      setSubmitError('This prediction is locked and cannot be changed.')
      return
    }
    const rowMatch = poolMatches.find((m) => m.id === matchId)
    if (!rowMatch || !canEditPredictionOnMatch(rowMatch, new Date())) {
      setSubmitError(PREDICTION_KICKOFF_LOCK_MESSAGE)
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
      setSubmitError(`Set a winning margin between 1 and ${PREDICT_SCORE_MARGIN_MAX} points.`)
      return
    }
    setSubmitError('')
    setSubmittingMatchId(matchId)
    const { error } = await upsertUserPrediction(supabase, user, {
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
    const pred = predictions.get(matchId)
    if (!pred?.id || pred.is_locked) return
    const rowMatch = poolMatches.find((m) => m.id === matchId)
    if (!rowMatch || !canEditPredictionOnMatch(rowMatch, new Date())) {
      setSubmitError(PREDICTION_KICKOFF_LOCK_MESSAGE)
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

  const renderMatchRow = (m: GameMatch) => {
    const pred = predictions.get(m.id)
    const closed = matchPredictionsClosed(m, atDate)
    const editable = canEditPredictionOnMatch(m, atDate)
    const rowBusy = submittingMatchId === m.id
    const showLock =
      (soccerMode ? hasSoccerPredictionSubmission(pred) : Boolean(pred?.id)) &&
      !pred?.is_locked &&
      editable &&
      !closed

    if (soccerMode) {
      const pick = soccerPicksByMatch[m.id] ?? soccerPickFromPrediction(pred, closed)
      return (
        <div key={m.id} id={`pool-predict-card-${m.id}`} className="scroll-mt-24">
          <SoccerMatchCard
            competitionSlug={competitionSlug ?? undefined}
            homeTeam={m.home_team}
            awayTeam={m.away_team}
            kickoffTime={m.kickoff_time}
            homeGoalsInput={pick.homeGoals}
            awayGoalsInput={pick.awayGoals}
            onHomeGoalsChange={(value) => setSoccerPick(m.id, { homeGoals: value })}
            onAwayGoalsChange={(value) => setSoccerPick(m.id, { awayGoals: value })}
            matchId={m.id}
            signedIn
            predictionsClosed={closed}
            editable={editable}
            predictionRowLocked={Boolean(pred?.is_locked)}
            hasExistingSubmission={hasSoccerPredictionSubmission(pred)}
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
      <div key={m.id} id={`pool-predict-card-${m.id}`} className="scroll-mt-24">
        <MatchCard
          competitionSlug={competitionSlug ?? undefined}
          homeTeam={m.home_team}
          awayTeam={m.away_team}
          kickoffTime={m.kickoff_time}
          winner={pick.winner}
          marginInput={pick.margin}
          onSelectWinner={(side) => setPick(m.id, { winner: side })}
          onMarginInputChange={(value) => setPick(m.id, { margin: value })}
          matchId={m.id}
          signedIn
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

  if (scopeIdSet.size === 0) {
    return (
      <p className="mt-4 min-w-0 max-w-full break-words text-sm text-gray-600">
        This pool has no fixtures in scope yet. Configure groups or teams under Manage pools.
      </p>
    )
  }

  const listHeaderCols = soccerMode
    ? SOCCER_PREDICT_HEADER_GRID
    : 'grid min-w-[640px] grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem_4.25rem_6.5rem] items-center gap-2'

  return (
    <div className="mt-4 w-full max-w-full min-w-0">
      <PredictScoreAuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <PredictionMarginModal match={marginModalMatch} onClose={() => setMarginModalMatch(null)} />

      {loadError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>
      ) : null}
      {submitError ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{submitError}</p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading fixtures…</p>
      ) : poolMatches.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          No upcoming pool fixtures (kickoff must be in the future). Check back later or review scope on Manage pools.
        </p>
      ) : (
        grouped.map((block) => (
          <section key={block.province} className="mt-6 w-full min-w-0 max-w-full space-y-4">
            <h3 className="flex min-w-0 max-w-full items-center gap-2 border-b border-gray-200 pb-2 text-base font-black text-gray-900">
              <ProvinceLogoMark label={block.province} labelOnly size={28} className="shrink-0 shadow-sm" />
              <span className="min-w-0 break-words leading-tight">{block.province}</span>
            </h3>
            {block.dates.map((day) => (
              <div key={day.dateKey} className="min-w-0 max-w-full space-y-3">
                <h4 className="min-w-0 break-words text-sm font-semibold text-gray-500">{day.label}</h4>
                <div className="mb-1 hidden w-full max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 md:block">
                  <div className={`${listHeaderCols} text-[10px] font-black uppercase tracking-wide text-gray-500`}>
                    <span>Kickoff</span>
                    <span>Home</span>
                    {soccerMode ? <span className="text-center">Score</span> : null}
                    <span>Away</span>
                    {!soccerMode ? <span className="text-center">Mgn</span> : null}
                    <span className="text-center">Save</span>
                    <span className="text-center">Admin</span>
                  </div>
                </div>
                <div className="space-y-2">{day.matches.map((m) => renderMatchRow(m))}</div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  )
}
