'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import {
  fetchGameMatchesForCommunityHub,
  fetchLeaderboardSeasons,
  fetchSeasonLeaderboard,
  type SeasonLeaderboardRow,
} from '@/lib/public-prediction-game'
import {
  fetchEffectivePoolMatches,
  fetchMyPools,
  fetchPoolLeaderboard,
  type PoolLeaderboardRow,
  type PoolRow,
} from '@/lib/pools'
import HowItWorksModal from '@/components/HowItWorksModal'
import InfoTooltip from '@/components/InfoTooltip'
import LetterAvatar from '@/components/LetterAvatar'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

const DEFAULT_SEASON = new Date().getFullYear()

const TOOLTIP_POINTS =
  'Total points = correct winner (1) + margin accuracy (up to 1.0) + closest margin bonus (0.5). Max 2.5 per game.'

const TOOLTIP_MARGIN_TOTAL =
  'Total margin error across all scored predictions.'

const TOOLTIP_MARGIN_AVG =
  'Lower is better. Your average distance from the actual margin.'

const GLOBAL_QUALIFIED_MIN = 5
const POOL_QUALIFIED_MIN = 3

type LeaderTab = 'points' | 'margin_total' | 'margin_avg'
type RankingSection = 'global' | 'pools'
type QualificationFilter = 'all' | 'qualified'

function rankCell(rank: number): string {
  if (rank === 1) return '🥇 #1'
  if (rank === 2) return '🥈 #2'
  if (rank === 3) return '🥉 #3'
  return `#${rank}`
}

function medalStyles(rank: number): string {
  if (rank === 1) return 'border-yellow-300 bg-yellow-50 text-yellow-900'
  if (rank === 2) return 'border-gray-300 bg-gray-100 text-gray-800'
  if (rank === 3) return 'border-amber-400 bg-amber-50 text-amber-900'
  return 'border-gray-200 bg-white text-gray-700'
}

function marginAvgDisplay(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return v.toFixed(2)
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

/** Sort for leaderboard (Points | cumulative margin | average margin). */
function leaderboardForTab(rows: SeasonLeaderboardRow[], tab: LeaderTab): SeasonLeaderboardRow[] {
  const list = [...rows]

  switch (tab) {
    case 'points':
      list.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        if (a.cumulative_margin_error !== b.cumulative_margin_error) {
          return a.cumulative_margin_error - b.cumulative_margin_error
        }
        return compareUserId(a, b)
      })
      break
    case 'margin_total':
      list.sort((a, b) => {
        if (a.cumulative_margin_error !== b.cumulative_margin_error) {
          return a.cumulative_margin_error - b.cumulative_margin_error
        }
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        return compareUserId(a, b)
      })
      break
    case 'margin_avg':
      list.sort((a, b) => {
        const av = a.average_margin_error ?? Number.POSITIVE_INFINITY
        const bv = b.average_margin_error ?? Number.POSITIVE_INFINITY
        if (av !== bv) return av - bv
        if (a.cumulative_margin_error !== b.cumulative_margin_error) {
          return a.cumulative_margin_error - b.cumulative_margin_error
        }
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        return compareUserId(a, b)
      })
      break
    default:
      break
  }

  return list
}

const SORT_OPTIONS: { value: LeaderTab; label: string }[] = [
  { value: 'points', label: 'Points' },
  { value: 'margin_avg', label: 'Average margin error' },
  { value: 'margin_total', label: 'Cumulative margin error' },
]

function primaryMetricLine(r: SeasonLeaderboardRow, tab: LeaderTab): { label: string; value: string } {
  if (tab === 'points') return { label: 'Points', value: String(r.total_points) }
  if (tab === 'margin_total')
    return { label: 'Cumulative margin error', value: String(r.cumulative_margin_error) }
  return { label: 'Average margin error', value: marginAvgDisplay(r.average_margin_error) }
}

export default function UserRankingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [section, setSection] = useState<RankingSection>('global')
  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [poolRows, setPoolRows] = useState<PoolLeaderboardRow[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolMetric, setPoolMetric] = useState<'total' | 'margin_total' | 'margin_avg'>('margin_avg')
  const [qualification, setQualification] = useState<QualificationFilter>('qualified')
  const [season, setSeason] = useState(DEFAULT_SEASON)
  const [seasonOptions, setSeasonOptions] = useState<number[]>(() => [DEFAULT_SEASON])
  const [rows, setRows] = useState<SeasonLeaderboardRow[]>([])
  const [tab, setTab] = useState<LeaderTab>('points')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [howModalOpen, setHowModalOpen] = useState(false)
  const [poolPredictionCounts, setPoolPredictionCounts] = useState<Record<string, number>>({})
  const [weeklyRows, setWeeklyRows] = useState<
    { user_id: string; display_name: string; avatar_url: string | null; avatar_letter: string | null; avatar_colour: string | null; average_margin_error: number }[]
  >([])
  const [weeklyLoading, setWeeklyLoading] = useState(false)

  const baseGlobalRows = useMemo(
    () =>
      qualification === 'qualified'
        ? rows.filter((r) => r.predictions_made >= GLOBAL_QUALIFIED_MIN)
        : rows,
    [rows, qualification]
  )
  const displayRows = useMemo(() => leaderboardForTab(baseGlobalRows, tab), [baseGlobalRows, tab])
  const selectedPool = useMemo(
    () => myPools.find((p) => p.id === selectedPoolId) ?? null,
    [myPools, selectedPoolId]
  )
  const filteredPoolRows = useMemo(() => {
    if (qualification === 'all') return poolRows
    return poolRows.filter((r) => (poolPredictionCounts[r.user_id] ?? 0) >= POOL_QUALIFIED_MIN)
  }, [poolRows, qualification, poolPredictionCounts])
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
    if (poolMetric === 'margin_total') return withCompetitionRanks(sortedPoolRows, (r) => r.total_margin_difference)
    return withCompetitionRanks(sortedPoolRows, (r) => r.average_margin_difference)
  }, [sortedPoolRows, poolMetric])
  const rankedGlobalRows = useMemo(() => {
    if (tab === 'points') return withCompetitionRanks(displayRows, (r) => r.total_points)
    if (tab === 'margin_total') return withCompetitionRanks(displayRows, (r) => r.cumulative_margin_error)
    return withCompetitionRanks(displayRows, (r) => r.average_margin_error)
  }, [displayRows, tab])

  const loadSeasons = useCallback(async () => {
    const { seasons, error: e } = await fetchLeaderboardSeasons(supabase)
    if (e) return
    if (seasons.length > 0) {
      setSeasonOptions(seasons)
      setSeason((prev) => (seasons.includes(prev) ? prev : seasons[0]))
    } else {
      setSeasonOptions([DEFAULT_SEASON])
    }
  }, [])

  const loadBoard = useCallback(async (y: number) => {
    setLoading(true)
    setError('')
    const { data, error: e } = await fetchSeasonLeaderboard(supabase, y)
    if (e) {
      setError(e.message)
      setRows([])
    } else {
      setRows(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    trackEvent('page_view', 'user-rankings')
  }, [])

  useEffect(() => {
    void loadSeasons()
  }, [loadSeasons])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) return
      const { pools } = await fetchMyPools(supabase, u.id)
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
      const { pools } = await fetchMyPools(supabase, u.id)
      setMyPools(pools)
      setSelectedPoolId((prev) => prev ?? pools[0]?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    void loadBoard(season)
  }, [season, loadBoard])

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

  useEffect(() => {
    async function loadWeekly() {
      setWeeklyLoading(true)
      const now = new Date()
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() + mondayOffset)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      const { data: matches } = await fetchGameMatchesForCommunityHub(supabase, 500)
      const weekMatchIds = matches
        .filter((m) => m.status === 'completed')
        .filter((m) => {
          const k = new Date(m.kickoff_time)
          return k >= weekStart && k < weekEnd
        })
        .map((m) => m.id)

      if (weekMatchIds.length === 0) {
        setWeeklyRows([])
        setWeeklyLoading(false)
        return
      }

      const { data: scores } = await supabase
        .from('user_prediction_scores')
        .select('user_id, margin_difference')
        .in('match_id', weekMatchIds)

      const acc = new Map<string, { total: number; count: number }>()
      ;((scores as { user_id: string; margin_difference: number | null }[] | null) ?? []).forEach((s) => {
        if (s.margin_difference == null) return
        const cur = acc.get(s.user_id) ?? { total: 0, count: 0 }
        cur.total += Number(s.margin_difference)
        cur.count += 1
        acc.set(s.user_id, cur)
      })
      const base = [...acc.entries()]
        .filter(([, v]) => v.count > 0)
        .map(([user_id, v]) => ({ user_id, average_margin_error: v.total / v.count }))
        .sort((a, b) => a.average_margin_error - b.average_margin_error || a.user_id.localeCompare(b.user_id))
        .slice(0, 5)

      if (base.length === 0) {
        setWeeklyRows([])
        setWeeklyLoading(false)
        return
      }

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url, avatar_letter, avatar_colour')
        .in('id', base.map((b) => b.user_id))
      const pm = new Map(
        ((profiles as { id: string; display_name: string | null; avatar_url: string | null; avatar_letter: string | null; avatar_colour: string | null }[] | null) ?? [])
          .map((p) => [p.id, p])
      )
      setWeeklyRows(
        base.map((b) => {
          const p = pm.get(b.user_id)
          return {
            user_id: b.user_id,
            display_name: p?.display_name?.trim() || 'Player',
            avatar_url: p?.avatar_url ?? null,
            avatar_letter: p?.avatar_letter ?? null,
            avatar_colour: p?.avatar_colour ?? null,
            average_margin_error: b.average_margin_error,
          }
        })
      )
      setWeeklyLoading(false)
    }
    void loadWeekly()
  }, [])

  const emptyFiltered = !loading && rows.length > 0 && displayRows.length === 0
  const topThree = rankedGlobalRows.slice(0, 3)
  const restRows = rankedGlobalRows.slice(3)
  /** With 4+ players, podium shows top 3 and the table starts at rank 4; otherwise the full list is in the table only. */
  const usePodiumLayout = rankedGlobalRows.length > 3
  const desktopLeaderRows = usePodiumLayout ? rankedGlobalRows.slice(3) : rankedGlobalRows
  const mobileListRows = usePodiumLayout ? restRows : rankedGlobalRows

  const t1 = topThree[0]
  const t2 = topThree[1]
  const t3 = topThree[2]

  return (
    <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 md:text-3xl">User Rankings</h1>
          <p className="mt-0.5 text-sm text-gray-600">See who&apos;s leading this season.</p>
        </div>
        <button
          type="button"
          onClick={() => setHowModalOpen(true)}
          className="shrink-0 self-start text-sm font-semibold text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
        >
          How it works
        </button>
      </div>

      <div className="mt-3 flex justify-center sm:justify-start">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setSection('global')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold md:px-4 md:py-2 md:text-sm ${
              section === 'global' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'
            }`}
          >
            Global Rankings
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
        <>
          <div className="sticky top-0 z-30 -mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 bg-white/95 px-4 py-2 backdrop-blur-sm md:mx-0 md:rounded-lg md:border md:py-2.5 md:shadow-sm">
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
            <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-gray-700 sm:flex-initial md:text-sm">
              <span className="shrink-0 text-gray-500">Sort by</span>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as LeaderTab)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 sm:min-w-[11rem]"
                aria-label="Sort leaderboard"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {qualification === 'qualified' ? (
            <p className="mt-1.5 text-center text-[11px] text-gray-500 sm:text-left">
              Qualified: 5+ scored predictions this season.
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
              {error}
            </p>
          ) : null}

      <div className="mt-3">
        {loading ? (
          <p className="text-center text-sm text-gray-500">Loading leaderboard…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-600">
            No scored predictions for this season yet. Complete a match, run scoring, then check
            again.
          </p>
        ) : emptyFiltered ? (
          <p className="text-center text-sm text-gray-600">
            No one meets the qualified filter for this season. Try &quot;All&quot; or another season.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {usePodiumLayout && t1 ? (
              <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white px-4 pb-4 pt-4">
                <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Top 3 · {SORT_OPTIONS.find((o) => o.value === tab)?.label ?? 'Rankings'}
                </p>
                <article
                  className={`mx-auto max-w-md rounded-2xl border-2 p-5 shadow-md ${medalStyles(1)}`}
                >
                  <div className="mb-3 flex justify-center">
                    <span className="inline-flex rounded-full border border-current/30 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                      {rankCell(1)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <LetterAvatar
                      letter={t1.row.avatar_letter}
                      colour={t1.row.avatar_colour}
                      avatarUrl={t1.row.avatar_url}
                      displayName={t1.row.display_name}
                      name={t1.row.display_name?.trim() || 'Player'}
                      size={64}
                      className="ring-2 ring-black/10"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-gray-900">
                        {t1.row.display_name?.trim() || 'Player'}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-gray-900">
                        {primaryMetricLine(t1.row, tab).value}
                      </p>
                      <p className="text-xs text-gray-600">{primaryMetricLine(t1.row, tab).label}</p>
                    </div>
                  </div>
                </article>
                {(t2 || t3) && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {t2 ? (
                      <article
                        className={`rounded-xl border p-3 shadow-sm ${medalStyles(2)}`}
                      >
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                          {rankCell(2)}
                        </div>
                        <div className="flex flex-col items-center gap-2 text-center">
                          <LetterAvatar
                            letter={t2.row.avatar_letter}
                            colour={t2.row.avatar_colour}
                            avatarUrl={t2.row.avatar_url}
                            displayName={t2.row.display_name}
                            name={t2.row.display_name?.trim() || 'Player'}
                            size={44}
                            className="ring-1 ring-black/10"
                          />
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {t2.row.display_name?.trim() || 'Player'}
                          </p>
                          <p className="text-base font-bold tabular-nums text-gray-900">
                            {primaryMetricLine(t2.row, tab).value}
                          </p>
                          <p className="text-[10px] text-gray-600">{primaryMetricLine(t2.row, tab).label}</p>
                        </div>
                      </article>
                    ) : (
                      <div />
                    )}
                    {t3 ? (
                      <article
                        className={`rounded-xl border p-3 shadow-sm ${medalStyles(3)}`}
                      >
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                          {rankCell(3)}
                        </div>
                        <div className="flex flex-col items-center gap-2 text-center">
                          <LetterAvatar
                            letter={t3.row.avatar_letter}
                            colour={t3.row.avatar_colour}
                            avatarUrl={t3.row.avatar_url}
                            displayName={t3.row.display_name}
                            name={t3.row.display_name?.trim() || 'Player'}
                            size={44}
                            className="ring-1 ring-black/10"
                          />
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {t3.row.display_name?.trim() || 'Player'}
                          </p>
                          <p className="text-base font-bold tabular-nums text-gray-900">
                            {primaryMetricLine(t3.row, tab).value}
                          </p>
                          <p className="text-[10px] text-gray-600">{primaryMetricLine(t3.row, tab).label}</p>
                        </div>
                      </article>
                    ) : (
                      <div />
                    )}
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-2 p-3 md:hidden">
              {mobileListRows.map(({ row: r, rank }, i) => {
                const name = r.display_name?.trim() || 'Player'
                const pm = primaryMetricLine(r, tab)
                const isYou = user?.id === r.user_id
                return (
                  <article
                    key={r.user_id}
                    className={`rounded-xl border p-3 shadow-sm ${
                      isYou
                        ? 'border-red-200 bg-red-50/90'
                        : i % 2 === 0
                          ? 'border-gray-100 bg-white'
                          : 'border-gray-100 bg-gray-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <LetterAvatar
                          letter={r.avatar_letter}
                          colour={r.avatar_colour}
                          avatarUrl={r.avatar_url}
                          displayName={r.display_name}
                          name={name}
                          size={36}
                          className="ring-1 ring-gray-200"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                          <p className="text-xs text-gray-500">#{rank}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-gray-900">{pm.value}</p>
                        <p className="text-[10px] text-gray-500">{pm.label}</p>
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-gray-600">
                      <div>
                        Pts: <span className="font-semibold text-gray-900">{r.total_points}</span>
                      </div>
                      <div>
                        Picks: <span className="font-semibold text-gray-900">{r.predictions_made}</span>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/90 text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="py-2 pl-3 pr-2">Rank</th>
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 pr-2 text-right normal-case">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Total pts</span>
                        <InfoTooltip label="Points" content={TOOLTIP_POINTS} />
                      </div>
                    </th>
                    <th className="py-2 pr-2 text-right normal-case">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Cumulative margin error</span>
                        <InfoTooltip label="Cumulative Margin Error" content={TOOLTIP_MARGIN_TOTAL} />
                      </div>
                    </th>
                    <th className="py-2 pr-2 text-right normal-case">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Average margin error</span>
                        <InfoTooltip label="Average Margin Error" content={TOOLTIP_MARGIN_AVG} />
                      </div>
                    </th>
                    <th className="py-2 pr-2 text-right">Picks</th>
                    <th className="py-2 pr-2 text-right">Right winner</th>
                    <th className="py-2 pr-3 text-right">Exact margin</th>
                  </tr>
                </thead>
                <tbody>
                  {desktopLeaderRows.map(({ row: r, rank }, i) => {
                    const name = r.display_name?.trim() || 'Player'
                    const isYou = user?.id === r.user_id
                    return (
                      <tr
                        key={r.user_id}
                        className={`border-b border-gray-100 ${
                          isYou
                            ? 'bg-red-50/90'
                            : i % 2 === 0
                              ? 'bg-white'
                              : 'bg-gray-50/70'
                        }`}
                      >
                        <td className="py-2.5 pl-3 pr-2 font-medium whitespace-nowrap text-gray-900">
                          {rankCell(rank)}
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <LetterAvatar
                              letter={r.avatar_letter}
                              colour={r.avatar_colour}
                              avatarUrl={r.avatar_url}
                              displayName={r.display_name}
                              name={name}
                              size={32}
                              className="ring-1 ring-gray-200"
                            />
                            <span className={`font-medium ${isYou ? 'text-gray-900' : 'text-gray-900'}`}>
                              {name}
                              {isYou ? (
                                <span className="ml-1.5 text-xs font-semibold text-red-700">You</span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">{r.total_points}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">{r.cumulative_margin_error}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">
                          {marginAvgDisplay(r.average_margin_error)}
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">{r.predictions_made}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">{r.correct_winner_count}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.exact_margin_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:p-4">
        <h2 className="text-base font-black text-gray-900">Most accurate this week</h2>
        {weeklyLoading ? (
          <p className="mt-2 text-sm text-gray-500">Loading weekly accuracy…</p>
        ) : weeklyRows.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No completed matches this week yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {weeklyRows.map((r, i) => (
              <div key={r.user_id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-8 text-xs font-bold text-gray-500">{rankCell(i + 1)}</span>
                  <LetterAvatar
                    letter={r.avatar_letter}
                    colour={r.avatar_colour}
                    avatarUrl={r.avatar_url}
                    displayName={r.display_name}
                    name={r.display_name}
                    size={28}
                    className="ring-1 ring-gray-200"
                  />
                  <span className="truncate text-sm font-semibold text-gray-900">{r.display_name}</span>
                </div>
                <span className="text-xs font-semibold text-gray-800">{r.average_margin_error.toFixed(2)} avg err</span>
              </div>
            ))}
          </div>
        )}
      </section>
        </>
      ) : (
        <section className="mt-3">
          {myPools.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-700">You are not in any pools yet.</p>
              <Link
                href="/pools"
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
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
                    aria-label="Select pool"
                  >
                    {myPools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
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
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-gray-700 sm:flex-initial md:text-sm">
                  <span className="shrink-0 text-gray-500">Sort by</span>
                  <select
                    value={poolMetric}
                    onChange={(e) =>
                      setPoolMetric(e.target.value as 'total' | 'margin_total' | 'margin_avg')
                    }
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700 sm:min-w-[11rem]"
                    aria-label="Sort pool leaderboard"
                  >
                    <option value="total">Points</option>
                    <option value="margin_avg">Average margin error</option>
                    <option value="margin_total">Cumulative margin error</option>
                  </select>
                </label>
              </div>
              {qualification === 'qualified' ? (
                <p className="mt-1.5 text-[11px] text-gray-500">Qualified: 3+ pool predictions in this pool.</p>
              ) : null}
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
    </main>
  )
}
