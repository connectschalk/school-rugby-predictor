'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CommunityDistributionPanel from '@/components/community-predictor/CommunityDistributionPanel'
import LetterAvatar from '@/components/LetterAvatar'
import { buildPoolCommunityStatsOk, type PoolMatchPredictionViewerRow } from '@/lib/pool-picks-stats'
import {
  fetchEffectivePoolMatches,
  fetchGameMatchesByIdsForPool,
  fetchPoolMatchPredictionsForViewer,
  type GameMatchForPoolPicks,
  type PoolMatchPredictionViewerRpcRow,
} from '@/lib/pools'
import { formatKickoffHm } from '@/lib/prediction-cutoff'
import { getJohannesburgWeekBounds, isKickoffInJohannesburgWeek } from '@/lib/sa-week'
import type { SupabaseClient } from '@supabase/supabase-js'

function mapRpcToStatRows(rows: PoolMatchPredictionViewerRpcRow[]): PoolMatchPredictionViewerRow[] {
  return rows.map((r) => ({
    user_id: r.user_id,
    predicted_winner: r.predicted_winner,
    predicted_margin: r.predicted_margin,
    reveal_allowed: r.reveal_allowed,
    is_viewer: r.is_viewer,
  }))
}

function formatSubmitted(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

type ViewerProfile = {
  display_name: string | null
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
}

export default function PoolPicksSection({
  supabase,
  poolId,
  userId,
  isMember,
}: {
  supabase: SupabaseClient
  poolId: string
  userId: string
  isMember: boolean
}) {
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [loadingGames, setLoadingGames] = useState(true)
  const [weekGames, setWeekGames] = useState<GameMatchForPoolPicks[]>([])
  const [gameIndex, setGameIndex] = useState(0)
  const [poolRows, setPoolRows] = useState<PoolMatchPredictionViewerRpcRow[]>([])
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [picksError, setPicksError] = useState('')
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('user_profiles')
      .select('display_name, avatar_url, avatar_letter, avatar_colour')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setViewerProfile((data as ViewerProfile | null) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  const loadWeekGames = useCallback(async () => {
    setLoadingGames(true)
    setPicksError('')
    try {
      const { matchIds, error: idErr } = await fetchEffectivePoolMatches(supabase, poolId)
      if (idErr) {
        setPicksError(idErr.message)
        setWeekGames([])
        return
      }
      const { data: matches, error: mErr } = await fetchGameMatchesByIdsForPool(supabase, matchIds)
      if (mErr) {
        setPicksError(mErr.message)
        setWeekGames([])
        return
      }
      const ref = new Date()
      const filtered = matches.filter((m) => isKickoffInJohannesburgWeek(m.kickoff_time, ref))
      setWeekGames(filtered)
      setGameIndex(0)
    } finally {
      setLoadingGames(false)
    }
  }, [supabase, poolId])

  useEffect(() => {
    void loadWeekGames()
  }, [loadWeekGames])

  useEffect(() => {
    setGameIndex((i) => Math.min(i, Math.max(0, weekGames.length - 1)))
  }, [weekGames.length])

  const match = weekGames[gameIndex] ?? null

  const loadPicksForMatch = useCallback(async () => {
    if (!match) {
      setPoolRows([])
      return
    }
    setPoolRows([])
    setLoadingPicks(true)
    setPicksError('')
    const { rows, error } = await fetchPoolMatchPredictionsForViewer(supabase, poolId, match.id)
    if (error) {
      setPicksError(error.message)
      setPoolRows([])
    } else {
      setPoolRows(rows)
    }
    setLoadingPicks(false)
  }, [supabase, poolId, match])

  /** Refetch when match changes or periodically so picks appear when the backend gate opens (no client-side prediction data). */
  useEffect(() => {
    void loadPicksForMatch()
  }, [loadPicksForMatch, nowTick])

  const showPicksData =
    Boolean(match) && !loadingPicks && !picksError && poolRows.length > 0
  const stats = useMemo(() => {
    if (!match || !showPicksData) return null
    return buildPoolCommunityStatsOk(match, mapRpcToStatRows(poolRows))
  }, [match, poolRows, showPicksData])

  const viewerAvatar = viewerProfile
    ? {
        displayName: viewerProfile.display_name?.trim() || 'You',
        avatarUrl: viewerProfile.avatar_url,
        avatarLetter: viewerProfile.avatar_letter,
        avatarColour: viewerProfile.avatar_colour,
      }
    : null

  const homePickUsers = useMemo(() => {
    if (!showPicksData) return []
    return poolRows.filter((r) => r.predicted_winner === 'home' && r.reveal_allowed)
  }, [poolRows, showPicksData])

  const awayPickUsers = useMemo(() => {
    if (!showPicksData) return []
    return poolRows.filter((r) => r.predicted_winner === 'away' && r.reveal_allowed)
  }, [poolRows, showPicksData])

  const tableRows = useMemo(() => {
    return [...poolRows].sort((a, b) => a.display_name.localeCompare(b.display_name))
  }, [poolRows])

  const weekLabel = useMemo(() => {
    const { weekStart, weekEnd } = getJohannesburgWeekBounds(new Date())
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(d)
    return `${fmt(weekStart)} – ${fmt(weekEnd)}`
  }, [])

  if (!isMember) {
    return (
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Pool picks are only visible to pool members.
      </p>
    )
  }

  if (loadingGames) {
    return <p className="mt-4 text-sm text-gray-500">Loading this week’s pool games…</p>
  }

  if (weekGames.length === 0) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-gray-900">This week’s pool picks</p>
        <p className="text-sm text-gray-600">{weekLabel}</p>
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          No games linked to this pool for the current week (South African Monday–Sunday window).
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-black text-gray-900">This week’s pool picks</h3>
          <p className="text-xs text-gray-500">{weekLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pool-picks-game-select">
            Select game
          </label>
          <select
            id="pool-picks-game-select"
            value={gameIndex}
            onChange={(e) => setGameIndex(Number(e.target.value))}
            className="max-w-[min(100%,280px)] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
          >
            {weekGames.map((g, i) => (
              <option key={g.id} value={i}>
                {g.home_team} vs {g.away_team}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous game"
              disabled={gameIndex <= 0}
              onClick={() => setGameIndex((i) => Math.max(0, i - 1))}
              className="inline-flex rounded-xl border border-gray-300 p-2 text-gray-800 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[7rem] text-center text-xs font-semibold tabular-nums text-gray-600">
              Game {gameIndex + 1} of {weekGames.length}
            </span>
            <button
              type="button"
              aria-label="Next game"
              disabled={gameIndex >= weekGames.length - 1}
              onClick={() => setGameIndex((i) => Math.min(weekGames.length - 1, i + 1))}
              className="inline-flex rounded-xl border border-gray-300 p-2 text-gray-800 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {picksError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{picksError}</p>
      ) : null}

      {match && loadingPicks ? (
        <p className="text-sm text-gray-500">Loading picks…</p>
      ) : null}

      {match && !loadingPicks ? (
        <>
          {!showPicksData ? (
            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-lg shadow-black/10">
              <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-6">
                <div className="min-w-0 text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Home</p>
                  <p className="mt-1 font-semibold text-gray-900">{match.home_team}</p>
                </div>
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-xs tracking-widest text-gray-400">VS</span>
                  <span className="mt-1 text-xs text-gray-600">
                    {formatKickoffHm(match.kickoff_time) ?? 'Kickoff TBC'} · {match.status}
                  </span>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs uppercase tracking-wide text-red-600">Away</p>
                  <p className="mt-1 font-semibold text-gray-900">{match.away_team}</p>
                </div>
              </div>
              <p className="mt-6 text-center text-sm font-semibold text-gray-800">
                Picks will be visible once this game locks.
              </p>
            </div>
          ) : stats ? (
            <>
              <CommunityDistributionPanel stats={stats} viewerAvatar={viewerAvatar} />
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-gray-600">Pool picks</p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase text-gray-500">{match.home_team}</p>
                    <div className="mt-2 flex flex-wrap gap-0">
                      {homePickUsers.map((r, i) => (
                        <span key={r.user_id} className={i > 0 ? '-ml-2' : ''} style={{ zIndex: homePickUsers.length - i }}>
                          <LetterAvatar
                            letter={r.avatar_letter}
                            colour={r.avatar_colour}
                            avatarUrl={r.avatar_url}
                            displayName={r.display_name}
                            name={r.display_name}
                            size={32}
                            className="ring-2 ring-white shadow-sm"
                          />
                        </span>
                      ))}
                      {homePickUsers.length === 0 ? (
                        <span className="text-xs text-gray-500">No home picks</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] font-bold uppercase text-red-700">{match.away_team}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-0">
                      {awayPickUsers.map((r, i) => (
                        <span key={r.user_id} className={i > 0 ? '-ml-2' : ''} style={{ zIndex: awayPickUsers.length - i }}>
                          <LetterAvatar
                            letter={r.avatar_letter}
                            colour={r.avatar_colour}
                            avatarUrl={r.avatar_url}
                            displayName={r.display_name}
                            name={r.display_name}
                            size={32}
                            className="ring-2 ring-white shadow-sm"
                          />
                        </span>
                      ))}
                      {awayPickUsers.length === 0 ? (
                        <span className="text-xs text-gray-500">No away picks</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {showPicksData ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h4 className="text-sm font-black text-gray-900">Picks detail</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600">
                      <th className="whitespace-nowrap px-4 py-3">Player</th>
                      <th className="whitespace-nowrap px-4 py-3">Picked winner</th>
                      <th className="whitespace-nowrap px-4 py-3">Predicted margin</th>
                      <th className="whitespace-nowrap px-4 py-3">Submitted at</th>
                      <th className="whitespace-nowrap px-4 py-3">Points</th>
                      <th className="whitespace-nowrap px-4 py-3">Margin diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => {
                      const winnerLabel =
                        r.predicted_winner === 'home'
                          ? match.home_team
                          : r.predicted_winner === 'away'
                            ? match.away_team
                            : '—'
                      const marginLabel =
                        r.predicted_margin != null ? String(r.predicted_margin) : '—'
                      const pts =
                        r.score_total_points != null
                          ? String(r.score_total_points)
                          : match.status === 'completed'
                            ? 'Not scored yet'
                            : '—'
                      const md =
                        r.score_margin_difference != null ? String(r.score_margin_difference) : match.status === 'completed' ? '—' : '—'
                      return (
                        <tr key={r.user_id} className="border-b border-gray-50">
                          <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                            <span className="inline-flex items-center gap-2">
                              <LetterAvatar
                                letter={r.avatar_letter}
                                colour={r.avatar_colour}
                                avatarUrl={r.avatar_url}
                                displayName={r.display_name}
                                name={r.display_name}
                                size={24}
                                className="ring-1 ring-gray-200"
                              />
                              {r.display_name}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-gray-800">{winnerLabel}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{marginLabel}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatSubmitted(r.submitted_at)}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{pts}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{md}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
