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
import { fetchEffectivePoolMatches, fetchMyPools, fetchPoolLeaderboard, type PoolRow } from '@/lib/pools'
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

type LeaderTab = 'all' | 'points' | 'margin_total' | 'margin_avg'
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

/** Sort for leaderboard tabs. */
function leaderboardForTab(rows: SeasonLeaderboardRow[], tab: LeaderTab): SeasonLeaderboardRow[] {
  const list = [...rows]

  switch (tab) {
    case 'all':
      list.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        const av = a.average_margin_error ?? Number.POSITIVE_INFINITY
        const bv = b.average_margin_error ?? Number.POSITIVE_INFINITY
        if (av !== bv) return av - bv
        return compareUserId(a, b)
      })
      break
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

const TAB_CONFIG: { id: LeaderTab; label: string; description: string }[] = [
  {
    id: 'all',
    label: 'All',
    description:
      'Anyone with at least one scored pick (you do not need to predict every match), sorted by total points.',
  },
  {
    id: 'points',
    label: 'Points',
    description:
      'Top 20–style board: players with 10+ scored picks only, sorted by total points.',
  },
  {
    id: 'margin_total',
    label: 'Cumulative Margin Error',
    description:
      'Top 20–style board: players with 10+ scored picks only, sorted by cumulative margin error (lower is better).',
  },
  {
    id: 'margin_avg',
    label: 'Average Margin Error',
    description:
      'Top 20–style board: players with 10+ scored picks only, sorted by average margin error per pick (lower is better).',
  },
]

export default function UserRankingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [section, setSection] = useState<RankingSection>('global')
  const [myPools, setMyPools] = useState<PoolRow[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [poolRows, setPoolRows] = useState<
    {
      user_id: string
      display_name: string
      avatar_url: string | null
      avatar_letter: string | null
      avatar_colour: string | null
      total_points: number
      total_margin_difference: number
      average_margin_difference: number | null
    }[]
  >([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolMetric, setPoolMetric] = useState<'total' | 'margin_total' | 'margin_avg'>('margin_avg')
  const [qualification, setQualification] = useState<QualificationFilter>('qualified')
  const [season, setSeason] = useState(DEFAULT_SEASON)
  const [seasonOptions, setSeasonOptions] = useState<number[]>(() => [DEFAULT_SEASON])
  const [rows, setRows] = useState<SeasonLeaderboardRow[]>([])
  const [tab, setTab] = useState<LeaderTab>('margin_avg')
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
    if (tab === 'all' || tab === 'points') return withCompetitionRanks(displayRows, (r) => r.total_points)
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

  const emptyFiltered =
    !loading && rows.length > 0 && displayRows.length === 0 && tab !== 'all'
  const topThree = rankedGlobalRows.slice(0, 3)
  const restRows = rankedGlobalRows.slice(3)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <div className="text-center md:text-left">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4 md:justify-start">
          <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">User Rankings</h1>
          <button
            type="button"
            onClick={() => setHowModalOpen(true)}
            className="shrink-0 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            How it works
          </button>
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 md:mx-0 md:text-base">
          Predict a Score season stats from scored matches only. You choose how many fixtures to
          play — each valid pick counts. Display names and avatars come from profiles; emails are
          never shown.
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setSection('global')}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              section === 'global' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'
            }`}
          >
            Global Rankings
          </button>
          <button
            type="button"
            onClick={() => setSection('pools')}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              section === 'pools' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-white'
            }`}
          >
            Pools
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ranking filter</span>
        <button
          type="button"
          onClick={() => setQualification('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${qualification === 'all' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'}`}
        >
          All players
        </button>
        <button
          type="button"
          onClick={() => setQualification('qualified')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${qualification === 'qualified' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'}`}
        >
          Qualified only
        </button>
      </div>

      {section === 'global' ? (
        <>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          Season
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-base font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {seasonOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2 rounded-full border border-gray-200 bg-gray-100 p-1 md:justify-start">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 ${
              tab === t.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-gray-500">
        {TAB_CONFIG.find((t) => t.id === tab)?.description}
      </p>
      {qualification === 'qualified' ? (
        <p className="mt-2 text-center text-xs text-gray-500">Qualified rankings show players with 5+ predictions.</p>
      ) : null}
      <div className="mx-auto mt-3 max-w-2xl rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        <p><strong>Average Margin Error:</strong> Lower is better. Your average distance from the actual margin.</p>
        <p className="mt-1"><strong>Cumulative Margin Error:</strong> Total margin error across all scored predictions.</p>
        <p className="mt-1"><strong>Total Points:</strong> Correct winner (1) + margin accuracy (up to 1.0) + closest margin bonus (0.5). Max 2.5 per game.</p>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-10">
        {loading ? (
          <p className="text-center text-sm text-gray-500">Loading leaderboard…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-600">
            No scored predictions for this season yet. Complete a match, run scoring, then check
            again.
          </p>
        ) : emptyFiltered ? (
          <p className="text-center text-sm text-gray-600">
            No players with 10 or more scored picks this season for this view. Try the &quot;All&quot;
            tab or pick another season.
          </p>
        ) : (
          <>
            {topThree.length > 0 ? (
              <section className="mb-6 grid gap-3 md:grid-cols-3">
                {topThree.map(({ row: r, rank }) => {
                  const name = r.display_name?.trim() || 'Player'
                  return (
                    <article
                      key={r.user_id}
                      className={`rounded-2xl border p-4 shadow-sm shadow-black/5 ${medalStyles(rank)}`}
                    >
                      <div className="mb-3 inline-flex rounded-full border border-current/30 px-2 py-1 text-[11px] font-bold uppercase tracking-wide">
                        {rankCell(rank)}
                      </div>
                      <div className="flex items-center gap-3">
                        <LetterAvatar
                          letter={r.avatar_letter}
                          colour={r.avatar_colour}
                          avatarUrl={r.avatar_url}
                          displayName={r.display_name}
                          name={name}
                          size={44}
                          className="ring-1 ring-black/10"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-gray-900">
                            {name}
                          </p>
                          <p className="text-sm text-gray-700">Total points: {r.total_points}</p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            ) : null}

            <div className="space-y-3 md:hidden">
              {restRows.map(({ row: r, rank }) => {
                const name = r.display_name?.trim() || 'Player'
                return (
                  <article key={r.user_id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm shadow-black/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LetterAvatar
                          letter={r.avatar_letter}
                          colour={r.avatar_colour}
                          avatarUrl={r.avatar_url}
                          displayName={r.display_name}
                          name={name}
                          size={36}
                          className="ring-1 ring-gray-200"
                        />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                          <p className="text-xs text-gray-500">#{rank}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{r.total_points} pts</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                      <div>Cumulative margin error: <span className="font-semibold text-gray-900">{r.cumulative_margin_error}</span></div>
                      <div>Average margin error: <span className="font-semibold text-gray-900">{marginAvgDisplay(r.average_margin_error)}</span></div>
                      <div>Picks: <span className="font-semibold text-gray-900">{r.predictions_made}</span></div>
                      <div>Correct winners: <span className="font-semibold text-gray-900">{r.correct_winner_count}</span></div>
                      <div>Exact margins: <span className="font-semibold text-gray-900">{r.exact_margin_count}</span></div>
                    </dl>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-2">Rank</th>
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
                <th className="py-2 text-right">Exact margin</th>
                  </tr>
                </thead>
                <tbody>
              {rankedGlobalRows.map(({ row: r, rank }) => {
                const name = r.display_name?.trim() || 'Player'
                return (
                  <tr key={r.user_id} className="border-b border-gray-100">
                    <td className="py-3 pr-2 font-medium text-gray-900 whitespace-nowrap">
                      {rankCell(rank)}
                    </td>
                    <td className="py-3 pr-2">
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
                        <span className="font-medium text-gray-900">
                          {name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-right tabular-nums">{r.total_points}</td>
                    <td className="py-3 pr-2 text-right tabular-nums">{r.cumulative_margin_error}</td>
                    <td className="py-3 pr-2 text-right tabular-nums">
                      {marginAvgDisplay(r.average_margin_error)}
                    </td>
                    <td className="py-3 pr-2 text-right tabular-nums">{r.predictions_made}</td>
                    <td className="py-3 pr-2 text-right tabular-nums">{r.correct_winner_count}</td>
                    <td className="py-3 text-right tabular-nums">{r.exact_margin_count}</td>
                  </tr>
                )
              })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-4">
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
        <section className="mt-8">
          {myPools.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
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
              <div className="mb-4 flex flex-wrap gap-2">
                {myPools.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPoolId(p.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      selectedPoolId === p.id
                        ? 'bg-gray-900 text-white'
                        : 'border border-gray-300 text-gray-800'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {qualification === 'qualified' ? (
                <p className="mb-4 text-xs text-gray-500">Qualified pool rankings show players with 3+ predictions.</p>
              ) : null}
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPoolMetric('total')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    poolMetric === 'total' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'
                  }`}
                >
                  Total points
                </button>
                <button
                  type="button"
                  onClick={() => setPoolMetric('margin_total')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    poolMetric === 'margin_total'
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-300 text-gray-800'
                  }`}
                >
                  Margin error
                </button>
                <button
                  type="button"
                  onClick={() => setPoolMetric('margin_avg')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    poolMetric === 'margin_avg' ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-800'
                  }`}
                >
                  Average margin error
                </button>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-base font-black text-gray-900">{selectedPool?.name ?? 'Pool leaderboard'}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Weekly movement indicators are shown as a placeholder in MVP and can be extended from historical snapshots.
                </p>
                {poolLoading ? (
                  <p className="mt-4 text-sm text-gray-500">Loading pool leaderboard…</p>
                ) : rankedPoolRows.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">No scored pool picks yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {rankedPoolRows.map(({ row: r, rank: poolRank }) => (
                      <div key={r.user_id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-8 text-xs font-bold text-gray-500">{rankCell(poolRank)}</span>
                          <LetterAvatar
                            letter={r.avatar_letter}
                            colour={r.avatar_colour}
                            avatarUrl={r.avatar_url}
                            displayName={r.display_name}
                            name={r.display_name}
                            size={30}
                            className="ring-1 ring-gray-200"
                          />
                          <span className="truncate text-sm font-semibold text-gray-900">{r.display_name}</span>
                          <span className="text-[10px] text-emerald-700">—</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-800">
                          {poolMetric === 'total'
                            ? `${r.total_points.toFixed(1)} pts`
                            : poolMetric === 'margin_total'
                              ? `${r.total_margin_difference} err`
                              : `${r.average_margin_difference == null ? '—' : r.average_margin_difference.toFixed(2)} avg err`}
                        </span>
                      </div>
                    ))}
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
