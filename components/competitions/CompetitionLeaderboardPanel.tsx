'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Info } from 'lucide-react'
import HowItWorksModal from '@/components/HowItWorksModal'
import InfoTooltip from '@/components/InfoTooltip'
import SoccerScoringRulesBody from '@/components/competitions/SoccerScoringRulesBody'
import SoccerScoringBreakdownModal, {
  type SoccerScoringBreakdownTarget,
} from '@/components/competitions/SoccerScoringBreakdownModal'
import SoccerLeaderboardPlayerButton from '@/components/competitions/SoccerLeaderboardPlayerButton'
import LetterAvatar from '@/components/LetterAvatar'
import {
  COMPETITION_LEADERBOARD_VIEW_MISSING_MESSAGE,
  fetchCompetitionLeaderboard,
  fetchCompetitionLeaderboardSeasons,
  fetchSeasonRecentMarginAverages,
  type SeasonLeaderboardRow,
} from '@/lib/public-prediction-game'
import { isSoccerExactScoreMode, type CompetitionScoringMode } from '@/lib/competitions'
import {
  defaultLeaderboardQualificationFilter,
  filterGlobalLeaderboardRows,
  filterPoolLeaderboardRows,
  globalLeaderboardFilterControls,
  leaderboardShowsQualificationFilter,
  type LeaderboardQualificationFilter,
} from '@/lib/leaderboard-filters'
import {
  fetchEffectivePoolMatches,
  fetchMyPools,
  fetchPoolLeaderboard,
  type PoolLeaderboardRow,
  type PoolRow,
} from '@/lib/pools'
import { supabase } from '@/lib/supabase'
import { SOCCER_SCORING_TOOLTIP_SUMMARY } from '@/lib/soccer-scoring-rules'

const DEFAULT_SEASON = new Date().getFullYear()
const TOOLTIP_POINTS_RUGBY =
  'Total points = correct winner (1) + margin accuracy (up to 1.0) + closest margin bonus (0.5). Max 2.5 per game.'
const TOOLTIP_MARGIN_AVG = 'Lower is better. Your average distance from the actual margin.'
const TOOLTIP_DELTA =
  'Season average minus your average margin error on your last 5 scored games (this season). Positive means recent games were closer to the actual margin than your season average.'

type LeaderTab = 'points' | 'margin_total' | 'margin_avg'
type RankingSection = 'global' | 'pools'

export type CompetitionLeaderboardPanelProps = {
  competitionId: string
  competitionSlug: string
  competitionName?: string
  scoringMode?: CompetitionScoringMode
}

function rankCell(rank: number): string {
  if (rank === 1) return '🥇 #1'
  if (rank === 2) return '🥈 #2'
  if (rank === 3) return '🥉 #3'
  return `#${rank}`
}

function marginAvgDisplay(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return v.toFixed(2)
}

function sortHelperLabel(tab: LeaderTab, soccerMode: boolean): string {
  if (soccerMode) {
    return 'Ranked by total points, then exact scores, then correct results.'
  }
  switch (tab) {
    case 'margin_avg':
      return 'Ranked by Average Margin Error (lower is better).'
    case 'points':
      return 'Ranked by total points.'
    case 'margin_total':
      return 'Ranked by cumulative margin error (lower is better).'
    default:
      return ''
  }
}

type DeltaTone = 'improve' | 'worse' | 'flat' | 'empty'

function marginDeltaDisplay(
  seasonAvg: number | null,
  recentAvg: number | null | undefined
): { text: string; tone: DeltaTone } {
  if (seasonAvg == null || recentAvg == null || Number.isNaN(recentAvg)) {
    return { text: '—', tone: 'empty' }
  }
  const d = seasonAvg - recentAvg
  if (Math.abs(d) < 0.01) return { text: '0.0', tone: 'flat' }
  const formatted = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1)
  return { text: formatted, tone: d > 0 ? 'improve' : 'worse' }
}

function deltaToneClass(tone: DeltaTone): string {
  switch (tone) {
    case 'improve':
      return 'text-emerald-700'
    case 'worse':
      return 'text-rose-700'
    case 'flat':
      return 'text-gray-500'
    default:
      return 'text-gray-400'
  }
}

function compareUserId(a: SeasonLeaderboardRow, b: SeasonLeaderboardRow): number {
  return a.user_id.localeCompare(b.user_id)
}

function withCompetitionRanks<T>(rows: T[], scoreOf: (row: T) => number | null): Array<{ row: T; rank: number }> {
  const out: Array<{ row: T; rank: number }> = []
  let rank = 0
  let lastScore: number | null = null
  for (let i = 0; i < rows.length; i += 1) {
    const score = scoreOf(rows[i])
    if (i === 0 || score !== lastScore) rank = i + 1
    out.push({ row: rows[i], rank })
    lastScore = score
  }
  return out
}

function leaderboardForTab(
  rows: SeasonLeaderboardRow[],
  tab: LeaderTab,
  soccerMode: boolean
): SeasonLeaderboardRow[] {
  const list = [...rows]
  switch (tab) {
    case 'points':
      if (soccerMode) {
        list.sort(
          (a, b) =>
            b.total_points - a.total_points ||
            b.exact_score_count - a.exact_score_count ||
            b.correct_result_count - a.correct_result_count ||
            compareUserId(a, b)
        )
      } else {
        list.sort((a, b) => b.total_points - a.total_points || compareUserId(a, b))
      }
      break
    case 'margin_total':
      list.sort(
        (a, b) => a.cumulative_margin_error - b.cumulative_margin_error || compareUserId(a, b)
      )
      break
    case 'margin_avg':
      list.sort((a, b) => {
        const av = a.average_margin_error ?? Number.POSITIVE_INFINITY
        const bv = b.average_margin_error ?? Number.POSITIVE_INFINITY
        return av - bv || compareUserId(a, b)
      })
      break
    default:
      break
  }
  return list
}

export default function CompetitionLeaderboardPanel({
  competitionId,
  competitionSlug,
  competitionName,
  scoringMode = 'rugby_margin',
}: CompetitionLeaderboardPanelProps) {
  const soccerMode = isSoccerExactScoreMode(scoringMode)
  const showQualificationFilter = leaderboardShowsQualificationFilter(scoringMode)
  const filterControls = globalLeaderboardFilterControls(scoringMode)
  const tooltipPoints = soccerMode ? SOCCER_SCORING_TOOLTIP_SUMMARY : TOOLTIP_POINTS_RUGBY
  const poolsPath = `/competitions/${competitionSlug}/pools`
  const [user, setUser] = useState<User | null>(null)
  const [section, setSection] = useState<RankingSection>('global')
  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [poolRows, setPoolRows] = useState<PoolLeaderboardRow[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolMetric, setPoolMetric] = useState<'total' | 'margin_total' | 'margin_avg'>('margin_avg')
  const [qualification, setQualification] = useState<LeaderboardQualificationFilter>(() =>
    defaultLeaderboardQualificationFilter(scoringMode)
  )
  const [season, setSeason] = useState(DEFAULT_SEASON)
  const [seasonOptions, setSeasonOptions] = useState<number[]>(() => [DEFAULT_SEASON])
  const [rows, setRows] = useState<SeasonLeaderboardRow[]>([])
  const [tab, setTab] = useState<LeaderTab>(soccerMode ? 'points' : 'margin_avg')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMissing, setViewMissing] = useState(false)
  const [howModalOpen, setHowModalOpen] = useState(false)
  const [scoringRulesOpen, setScoringRulesOpen] = useState(false)
  const [breakdownTarget, setBreakdownTarget] = useState<SoccerScoringBreakdownTarget | null>(null)
  const [poolPredictionCounts, setPoolPredictionCounts] = useState<Record<string, number>>({})
  const [recentAvgByUser, setRecentAvgByUser] = useState<Record<string, number | null>>({})

  const baseGlobalRows = useMemo(
    () => filterGlobalLeaderboardRows(rows, scoringMode, qualification),
    [rows, scoringMode, qualification]
  )
  const displayRows = useMemo(
    () => leaderboardForTab(baseGlobalRows, tab, soccerMode),
    [baseGlobalRows, tab, soccerMode]
  )
  const selectedPool = useMemo(
    () => myPools.find((p) => p.id === selectedPoolId) ?? null,
    [myPools, selectedPoolId]
  )
  const filteredPoolRows = useMemo(
    () =>
      filterPoolLeaderboardRows(poolRows, scoringMode, qualification, poolPredictionCounts, (r) => r.user_id),
    [poolRows, scoringMode, qualification, poolPredictionCounts]
  )
  const sortedPoolRows = useMemo(() => {
    const next = [...filteredPoolRows]
    if (poolMetric === 'total') {
      next.sort(
        (a, b) => b.total_points - a.total_points || a.total_margin_difference - b.total_margin_difference
      )
    } else if (poolMetric === 'margin_total') {
      next.sort(
        (a, b) => a.total_margin_difference - b.total_margin_difference || b.total_points - a.total_points
      )
    } else {
      next.sort((a, b) => {
        const av = a.average_margin_difference ?? Number.POSITIVE_INFINITY
        const bv = b.average_margin_difference ?? Number.POSITIVE_INFINITY
        return av - bv || b.total_points - a.total_points
      })
    }
    return next
  }, [filteredPoolRows, poolMetric])
  const rankedPoolRows = useMemo(() => {
    if (poolMetric === 'total') return withCompetitionRanks(sortedPoolRows, (r) => r.total_points)
    if (poolMetric === 'margin_total')
      return withCompetitionRanks(sortedPoolRows, (r) => r.total_margin_difference)
    return withCompetitionRanks(sortedPoolRows, (r) => r.average_margin_difference)
  }, [sortedPoolRows, poolMetric])
  const rankedGlobalRows = useMemo(() => {
    if (tab === 'points') return withCompetitionRanks(displayRows, (r) => r.total_points)
    if (tab === 'margin_total') return withCompetitionRanks(displayRows, (r) => r.cumulative_margin_error)
    return withCompetitionRanks(displayRows, (r) => r.average_margin_error)
  }, [displayRows, tab])

  const loadSeasons = useCallback(async () => {
    const { seasons, error: e, viewMissing: missing } = await fetchCompetitionLeaderboardSeasons(
      supabase,
      competitionId
    )
    if (missing) {
      setViewMissing(true)
      setError('')
      return
    }
    if (e) return
    if (seasons.length > 0) {
      setSeasonOptions(seasons)
      setSeason((prev) => (seasons.includes(prev) ? prev : seasons[0]))
    } else {
      setSeasonOptions([DEFAULT_SEASON])
    }
  }, [competitionId])

  const loadBoard = useCallback(
    async (y: number) => {
      setLoading(true)
      setError('')
      const { data, error: e, viewMissing: missing } = await fetchCompetitionLeaderboard(
        supabase,
        competitionId,
        y
      )
      if (missing) {
        setViewMissing(true)
        setError('')
        setRows([])
      } else if (e) {
        setViewMissing(false)
        setError(e.message)
        setRows([])
      } else {
        setViewMissing(false)
        setRows(data)
      }
      setLoading(false)
    },
    [competitionId]
  )

  useEffect(() => {
    void loadSeasons()
  }, [loadSeasons])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) return
      const { pools } = await fetchMyPools(supabase, u.id, competitionId)
      setMyPools(pools)
      setSelectedPoolId((prev) => prev ?? pools[0]?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setMyPools([])
        setSelectedPoolId(null)
        return
      }
      const { pools } = await fetchMyPools(supabase, u.id, competitionId)
      setMyPools(pools)
      setSelectedPoolId((prev) => prev ?? pools[0]?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [competitionId])

  useEffect(() => {
    void loadBoard(season)
  }, [season, loadBoard])

  useEffect(() => {
    if (section !== 'global') return
    let cancelled = false
    void (async () => {
      const { data, error: err } = await fetchSeasonRecentMarginAverages(
        supabase,
        season,
        5,
        competitionId
      )
      if (cancelled) return
      if (err) setRecentAvgByUser({})
      else setRecentAvgByUser(data)
    })()
    return () => {
      cancelled = true
    }
  }, [season, section, competitionId])

  useEffect(() => {
    if (!selectedPoolId) {
      setPoolRows([])
      setPoolPredictionCounts({})
      return
    }
    setPoolLoading(true)
    fetchPoolLeaderboard(supabase, selectedPoolId).then(({ rows: r }) => {
      setPoolRows(r)
      setPoolLoading(false)
    })
    fetchEffectivePoolMatches(supabase, selectedPoolId).then(async ({ matchIds }) => {
      if (!matchIds?.length) {
        setPoolPredictionCounts({})
        return
      }
      const { data } = await supabase
        .from('user_prediction_scores')
        .select('user_id')
        .in('match_id', matchIds)
      const counts: Record<string, number> = {}
      ;((data as { user_id: string }[] | null) ?? []).forEach((row) => {
        counts[row.user_id] = (counts[row.user_id] ?? 0) + 1
      })
      setPoolPredictionCounts(counts)
    })
  }, [selectedPoolId])

  const openBreakdown = useCallback(
    (userId: string, displayName: string | null, poolOptions?: { poolId: string; poolJoinedAt?: string }) => {
      if (!soccerMode) return
      setBreakdownTarget({
        userId,
        displayName: displayName?.trim() || 'Player',
        poolId: poolOptions?.poolId,
        poolJoinedAt: poolOptions?.poolJoinedAt,
      })
    },
    [soccerMode]
  )

  const emptyFiltered =
    showQualificationFilter &&
    qualification === 'qualified' &&
    !loading &&
    rows.length > 0 &&
    displayRows.length === 0

  return (
    <main className="mx-auto max-w-6xl px-4 py-2 md:px-6 md:py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-gray-900 md:text-2xl">
              Leaderboard{competitionName ? ` · ${competitionName}` : ''}
            </h1>
            {soccerMode ? (
              <button
                type="button"
                onClick={() => setScoringRulesOpen(true)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800"
                aria-label="View scoring rules"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-gray-600 md:text-sm">
            Rankings from scored matches in this competition only.
          </p>
        </div>
        {!soccerMode ? (
          <button
            type="button"
            onClick={() => setHowModalOpen(true)}
            className="shrink-0 pt-0.5 text-xs font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 md:text-sm"
          >
            How it works
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 flex justify-center sm:justify-start">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setSection('global')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold md:px-4 md:py-2 md:text-sm ${
              section === 'global' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'
            }`}
          >
            Competition
          </button>
          <button
            type="button"
            onClick={() => setSection('pools')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold md:px-4 md:py-2 md:text-sm ${
              section === 'pools' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'
            }`}
          >
            Pools
          </button>
        </div>
      </div>

      {section === 'global' ? (
        <div className="mt-3">
          <div className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gray-200 bg-white/95 px-4 py-1.5 shadow-sm backdrop-blur-sm md:static md:z-auto md:mx-0 md:rounded-md md:border md:shadow-sm">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 md:text-sm">
              <span className="text-gray-500">Season</span>
              <select
                value={season}
                onChange={(e) => setSeason(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
              >
                {seasonOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {filterControls.includes('all') ? (
              <>
                <span className="hidden h-4 w-px bg-gray-200 sm:block" aria-hidden />
                <div
                  className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5"
                  aria-label="Showing all players"
                >
                  <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white md:px-3">
                    All
                  </span>
                </div>
              </>
            ) : null}
            {filterControls.includes('qualification') ? (
              <>
                <span className="hidden h-4 w-px bg-gray-200 sm:block" aria-hidden />
                <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setQualification('all')}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold md:px-3 ${
                      qualification === 'all' ? 'bg-gray-900 text-white' : 'text-gray-700'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setQualification('qualified')}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold md:px-3 ${
                      qualification === 'qualified' ? 'bg-gray-900 text-white' : 'text-gray-700'
                    }`}
                  >
                    Qualified
                  </button>
                </div>
              </>
            ) : null}
            {filterControls.includes('sort') ? (
              <>
                <span className="hidden h-4 w-px bg-gray-200 sm:block" aria-hidden />
                <label className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-gray-700 sm:flex-initial md:text-sm">
                  <span className="text-gray-500">Sort by</span>
                  <select
                    value={tab}
                    onChange={(e) => setTab(e.target.value as LeaderTab)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm sm:min-w-[11rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
                  >
                    {soccerMode ? (
                      <option value="points">Points</option>
                    ) : (
                      <>
                        <option value="margin_avg">Average margin error</option>
                        <option value="points">Points</option>
                        <option value="margin_total">Cumulative margin error</option>
                      </>
                    )}
                  </select>
                </label>
              </>
            ) : null}
          </div>

          {viewMissing ? (
            <div
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">Leaderboard not deployed yet</p>
              <p className="mt-1 leading-relaxed">{COMPETITION_LEADERBOARD_VIEW_MISSING_MESSAGE}</p>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          {viewMissing ? null : loading ? (
            <p className="py-6 text-center text-sm text-gray-500">Loading leaderboard…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">
              No scored matches for this competition yet. Complete a fixture and run scoring to see
              rankings.
            </p>
          ) : emptyFiltered ? (
            <p className="py-6 text-center text-sm text-gray-600">
              No one meets the qualified filter for this season. Try &quot;All&quot; or another season.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <p className="border-b border-gray-100 bg-gray-50/80 px-3 py-2 text-[11px] text-gray-600 md:text-xs">
                {sortHelperLabel(tab, soccerMode)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      <th className="py-2 pl-3 pr-2">Rank</th>
                      <th className="py-2 pr-2">Player</th>
                      {soccerMode ? (
                        <>
                          <th className="py-2 pr-2 text-right">Exact</th>
                          <th className="py-2 pr-2 text-right">Results</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2 pr-2 text-right normal-case">
                            <div className="inline-flex items-center justify-end gap-1">
                              <span>Avg margin</span>
                              <InfoTooltip label="Average margin error" content={TOOLTIP_MARGIN_AVG} />
                            </div>
                          </th>
                          <th className="py-2 pr-2 text-right normal-case">
                            <div className="inline-flex items-center justify-end gap-1">
                              <span>Delta</span>
                              <InfoTooltip label="Delta" content={TOOLTIP_DELTA} />
                            </div>
                          </th>
                        </>
                      )}
                      <th className="py-2 pr-2 text-right normal-case">
                        <div className="inline-flex items-center justify-end gap-1">
                          <span>Points</span>
                          <InfoTooltip label="Points" content={tooltipPoints} />
                        </div>
                      </th>
                      <th className="py-2 pr-3 text-right">Picks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedGlobalRows.map(({ row: r, rank }, i) => {
                      const name = r.display_name?.trim() || 'Player'
                      const isYou = user?.id === r.user_id
                      const delta = marginDeltaDisplay(r.average_margin_error, recentAvgByUser[r.user_id])
                      return (
                        <tr
                          key={r.user_id}
                          className={`border-b border-gray-100 ${
                            isYou ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/90'
                          }`}
                        >
                          <td className="py-2 pl-3 pr-2 font-medium whitespace-nowrap">{rankCell(rank)}</td>
                          <td className="py-2 pr-2">
                            {soccerMode ? (
                              <SoccerLeaderboardPlayerButton
                                name={name}
                                displayName={r.display_name}
                                avatarUrl={r.avatar_url}
                                avatarLetter={r.avatar_letter}
                                avatarColour={r.avatar_colour}
                                isYou={isYou}
                                onOpen={() => openBreakdown(r.user_id, r.display_name)}
                              />
                            ) : (
                              <div className="flex min-w-0 items-center gap-2">
                                <LetterAvatar
                                  letter={r.avatar_letter}
                                  colour={r.avatar_colour}
                                  avatarUrl={r.avatar_url}
                                  displayName={r.display_name}
                                  name={name}
                                  size={32}
                                  className="shrink-0 ring-1 ring-gray-200"
                                />
                                <span className="min-w-0 truncate font-medium">
                                  {name}
                                  {isYou ? (
                                    <span className="ml-1.5 text-xs font-semibold text-red-700">You</span>
                                  ) : null}
                                </span>
                              </div>
                            )}
                          </td>
                          {soccerMode ? (
                            <>
                              <td className="py-2 pr-2 text-right font-bold tabular-nums">
                                {r.exact_score_count}
                              </td>
                              <td className="py-2 pr-2 text-right font-bold tabular-nums">
                                {r.correct_result_count}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 pr-2 text-right font-bold tabular-nums">
                                {marginAvgDisplay(r.average_margin_error)}
                              </td>
                              <td
                                className={`py-2 pr-2 text-right text-sm font-medium tabular-nums ${deltaToneClass(delta.tone)}`}
                              >
                                {delta.text}
                              </td>
                            </>
                          )}
                          <td className="py-2 pr-2 text-right text-xs tabular-nums text-gray-500">
                            {r.total_points}
                          </td>
                          <td className="py-2 pr-3 text-right text-xs tabular-nums text-gray-500">
                            {r.predictions_made}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <section className="mt-3">
          {myPools.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-700">You are not in any pools for this competition yet.</p>
              <Link
                href={poolsPath}
                className="mt-3 inline-flex rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Create or join a pool
              </Link>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 bg-white/95 px-4 py-2 backdrop-blur-sm md:mx-0 md:rounded-lg md:border md:shadow-sm">
                <label className="flex min-w-0 max-w-full items-center gap-1.5 text-xs font-semibold text-gray-700 sm:max-w-[min(100%,20rem)] md:text-sm">
                  <span className="shrink-0 text-gray-500">Pool</span>
                  <select
                    value={selectedPoolId ?? myPools[0]?.id ?? ''}
                    onChange={(e) => setSelectedPoolId(e.target.value || null)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {myPools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-gray-700 sm:flex-initial md:text-sm">
                  <span className="shrink-0 text-gray-500">Sort by</span>
                  <select
                    value={poolMetric}
                    onChange={(e) =>
                      setPoolMetric(e.target.value as 'total' | 'margin_total' | 'margin_avg')
                    }
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm sm:min-w-[11rem]"
                  >
                    <option value="total">Points</option>
                    <option value="margin_avg">Average margin error</option>
                    <option value="margin_total">Cumulative margin error</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:p-4">
                <h2 className="text-base font-black text-gray-900">{selectedPool?.name ?? 'Pool leaderboard'}</h2>
                {poolLoading ? (
                  <p className="mt-3 text-sm text-gray-500">Loading pool leaderboard…</p>
                ) : rankedPoolRows.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">No scored pool picks yet.</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {rankedPoolRows.map(({ row: r, rank: poolRank }, i) => {
                      const isYou = user?.id === r.user_id
                      return (
                        <div
                          key={r.user_id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                            isYou
                              ? 'border-red-200 bg-red-50/90'
                              : i % 2 === 0
                                ? 'border-gray-100 bg-white'
                                : 'border-gray-100 bg-gray-50/80'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-8 shrink-0 text-xs font-bold text-gray-500">
                              {rankCell(poolRank)}
                            </span>
                            {soccerMode ? (
                              <SoccerLeaderboardPlayerButton
                                name={r.display_name}
                                displayName={r.display_name}
                                avatarUrl={r.avatar_url}
                                avatarLetter={r.avatar_letter}
                                avatarColour={r.avatar_colour}
                                size={30}
                                isYou={isYou}
                                onOpen={() => {
                                  if (!selectedPoolId) return
                                  openBreakdown(r.user_id, r.display_name, {
                                    poolId: selectedPoolId,
                                    poolJoinedAt: r.joined_at,
                                  })
                                }}
                                className="min-w-0 flex-1"
                              />
                            ) : (
                              <>
                                <LetterAvatar
                                  letter={r.avatar_letter}
                                  colour={r.avatar_colour}
                                  avatarUrl={r.avatar_url}
                                  displayName={r.display_name}
                                  name={r.display_name}
                                  size={30}
                                  className="ring-1 ring-gray-200"
                                />
                                <span className="truncate text-sm font-semibold text-gray-900">
                                  {r.display_name}
                                  {isYou ? (
                                    <span className="ml-1.5 text-xs font-semibold text-red-700">You</span>
                                  ) : null}
                                </span>
                              </>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-gray-800">
                            {poolMetric === 'total'
                              ? `${r.total_points.toFixed(1)} pts`
                              : poolMetric === 'margin_total'
                                ? `${r.total_margin_difference} cum. err`
                                : `${r.average_margin_difference == null ? '—' : r.average_margin_difference.toFixed(2)} avg err`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      <HowItWorksModal open={howModalOpen} onClose={() => setHowModalOpen(false)} />
      {soccerMode ? (
        <HowItWorksModal
          open={scoringRulesOpen}
          onClose={() => setScoringRulesOpen(false)}
          title="How scoring works"
        >
          <SoccerScoringRulesBody />
        </HowItWorksModal>
      ) : null}
      {soccerMode ? (
        <SoccerScoringBreakdownModal
          open={breakdownTarget !== null}
          onClose={() => setBreakdownTarget(null)}
          client={supabase}
          target={breakdownTarget}
          competitionId={competitionId}
          competitionSlug={competitionSlug}
          season={section === 'global' ? season : undefined}
        />
      ) : null}
    </main>
  )
}
