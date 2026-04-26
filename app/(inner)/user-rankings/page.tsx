'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchLeaderboardSeasons,
  fetchSeasonLeaderboard,
  type SeasonLeaderboardRow,
} from '@/lib/public-prediction-game'
import HowItWorksModal from '@/components/HowItWorksModal'
import InfoTooltip from '@/components/InfoTooltip'
import LetterAvatar from '@/components/LetterAvatar'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

const DEFAULT_SEASON = new Date().getFullYear()

const TOOLTIP_POINTS =
  'Total score from all predictions. You get 2 points for the correct winner and up to 5 points for how close your margin prediction is. Maximum 7 points per game.'

const TOOLTIP_MARGIN_TOTAL =
  'Total margin points earned across all predictions. This excludes winner points and only measures how close your predicted margin was.'

const TOOLTIP_MARGIN_AVG =
  'Average margin accuracy per prediction. Calculated as total margin points divided by number of predictions.'

type LeaderTab = 'all' | 'points' | 'margin_total' | 'margin_avg'

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

/** Filter + sort for leaderboard tabs (10+ picks filter for competitive tabs). */
function leaderboardForTab(rows: SeasonLeaderboardRow[], tab: LeaderTab): SeasonLeaderboardRow[] {
  let list = [...rows]
  if (tab !== 'all') {
    list = list.filter((r) => r.predictions_made >= 10)
  }

  switch (tab) {
    case 'all':
      list.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        if (b.margin_points_total !== a.margin_points_total) return b.margin_points_total - a.margin_points_total
        return compareUserId(a, b)
      })
      break
    case 'points':
      list.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        if (b.margin_points_total !== a.margin_points_total) return b.margin_points_total - a.margin_points_total
        return compareUserId(a, b)
      })
      break
    case 'margin_total':
      list.sort((a, b) => {
        if (b.margin_points_total !== a.margin_points_total) {
          return b.margin_points_total - a.margin_points_total
        }
        if (b.total_points !== a.total_points) return b.total_points - a.total_points
        return compareUserId(a, b)
      })
      break
    case 'margin_avg':
      list.sort((a, b) => {
        const av = a.margin_points_average ?? 0
        const bv = b.margin_points_average ?? 0
        if (bv !== av) return bv - av
        if (b.margin_points_total !== a.margin_points_total) return b.margin_points_total - a.margin_points_total
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
    label: 'Margin Total',
    description:
      'Top 20–style board: players with 10+ scored picks only, sorted by margin points total.',
  },
  {
    id: 'margin_avg',
    label: 'Margin Average',
    description:
      'Top 20–style board: players with 10+ scored picks only, sorted by average margin points per pick.',
  },
]

export default function UserRankingsPage() {
  const [season, setSeason] = useState(DEFAULT_SEASON)
  const [seasonOptions, setSeasonOptions] = useState<number[]>(() => [DEFAULT_SEASON])
  const [rows, setRows] = useState<SeasonLeaderboardRow[]>([])
  const [tab, setTab] = useState<LeaderTab>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [howModalOpen, setHowModalOpen] = useState(false)

  const displayRows = useMemo(() => leaderboardForTab(rows, tab), [rows, tab])

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
    void loadBoard(season)
  }, [season, loadBoard])

  const emptyFiltered =
    !loading && rows.length > 0 && displayRows.length === 0 && tab !== 'all'
  const topThree = displayRows.slice(0, 3)
  const restRows = displayRows.slice(3)

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
                {topThree.map((r, i) => {
                  const rank = i + 1
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
              {restRows.map((r, i) => {
                const rank = i + 4
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
                      <div>Margin total: <span className="font-semibold text-gray-900">{r.margin_points_total}</span></div>
                      <div>Margin avg: <span className="font-semibold text-gray-900">{marginAvgDisplay(r.margin_points_average)}</span></div>
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
                    <span>Margin total</span>
                    <InfoTooltip label="Margin Total" content={TOOLTIP_MARGIN_TOTAL} />
                  </div>
                </th>
                <th className="py-2 pr-2 text-right normal-case">
                  <div className="inline-flex items-center justify-end gap-1">
                    <span>Margin avg</span>
                    <InfoTooltip label="Margin Average" content={TOOLTIP_MARGIN_AVG} />
                  </div>
                </th>
                <th className="py-2 pr-2 text-right">Picks</th>
                <th className="py-2 pr-2 text-right">Right winner</th>
                <th className="py-2 text-right">Exact margin</th>
                  </tr>
                </thead>
                <tbody>
              {displayRows.map((r, i) => {
                const rank = i + 1
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
                    <td className="py-3 pr-2 text-right tabular-nums">{r.margin_points_total}</td>
                    <td className="py-3 pr-2 text-right tabular-nums">
                      {marginAvgDisplay(r.margin_points_average)}
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

      <HowItWorksModal open={howModalOpen} onClose={() => setHowModalOpen(false)} />
    </main>
  )
}
