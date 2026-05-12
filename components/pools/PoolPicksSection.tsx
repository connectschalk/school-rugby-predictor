'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CommunityDistributionPanel from '@/components/community-predictor/CommunityDistributionPanel'
import LetterAvatar from '@/components/LetterAvatar'
import { buildPoolCommunityStatsOk, type PoolMatchPredictionViewerRow } from '@/lib/pool-picks-stats'
import {
  fetchEffectivePoolMatches,
  fetchGameMatchesByIdsForPool,
  fetchPoolLeaderboard,
  fetchPoolMatchPredictionsForViewer,
  type GameMatchForPoolPicks,
  type PoolLeaderboardRow,
  type PoolMatchPredictionViewerRpcRow,
} from '@/lib/pools'
import { formatKickoffHm } from '@/lib/prediction-cutoff'
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

type PoolPicksSegment = 'upcoming' | 'past'

type ScoreExtras = { winner_points: number; margin_points: number }

function compareKickoffAsc(a: GameMatchForPoolPicks, b: GameMatchForPoolPicks): number {
  return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
}

function compareKickoffDesc(a: GameMatchForPoolPicks, b: GameMatchForPoolPicks): number {
  return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime()
}

function formatPoolPickDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function sortPoolLeaderboardRows(rows: PoolLeaderboardRow[]): PoolLeaderboardRow[] {
  return [...rows].sort(
    (a, b) =>
      b.total_points - a.total_points ||
      a.total_margin_difference - b.total_margin_difference ||
      b.games_predicted - a.games_predicted ||
      a.display_name.localeCompare(b.display_name)
  )
}

/** Competition rank on `total_points` only (ties share rank). */
function rankByPointsDesc(
  rows: Array<{ user_id: string; points: number | null }>
): Map<string, number | null> {
  const out = new Map<string, number | null>()
  const sorted = [...rows].sort((a, b) => {
    if (a.points == null && b.points == null) return a.user_id.localeCompare(b.user_id)
    if (a.points == null) return 1
    if (b.points == null) return -1
    if (b.points !== a.points) return b.points - a.points
    return a.user_id.localeCompare(b.user_id)
  })
  let i = 0
  while (i < sorted.length) {
    const r = sorted[i]!
    if (r.points == null) {
      out.set(r.user_id, null)
      i += 1
      continue
    }
    const p = r.points
    let j = i
    while (j < sorted.length && sorted[j]!.points === p) j += 1
    const rank = i + 1
    for (let k = i; k < j; k += 1) out.set(sorted[k]!.user_id, rank)
    i = j
  }
  return out
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
  const [picksSegment, setPicksSegment] = useState<PoolPicksSegment>('upcoming')
  const [allPoolGames, setAllPoolGames] = useState<GameMatchForPoolPicks[]>([])
  const [gameIndex, setGameIndex] = useState(0)
  const [poolRows, setPoolRows] = useState<PoolMatchPredictionViewerRpcRow[]>([])
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [picksError, setPicksError] = useState('')
  const [viewerProfile, setViewerProfile] = useState<ViewerProfile | null>(null)
  const [poolLeaderboard, setPoolLeaderboard] = useState<PoolLeaderboardRow[]>([])
  const [scoreExtrasByUser, setScoreExtrasByUser] = useState<Record<string, ScoreExtras>>({})

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

  const loadPoolGames = useCallback(async () => {
    setLoadingGames(true)
    setPicksError('')
    try {
      const { matchIds, error: idErr } = await fetchEffectivePoolMatches(supabase, poolId)
      if (idErr) {
        setPicksError(idErr.message)
        setAllPoolGames([])
        return
      }
      const { data: matches, error: mErr } = await fetchGameMatchesByIdsForPool(supabase, matchIds)
      if (mErr) {
        setPicksError(mErr.message)
        setAllPoolGames([])
        return
      }
      setAllPoolGames([...matches].sort(compareKickoffAsc))
      setGameIndex(0)
    } finally {
      setLoadingGames(false)
    }
  }, [supabase, poolId])

  useEffect(() => {
    void loadPoolGames()
  }, [loadPoolGames])

  const displayGames = useMemo(() => {
    const ref = new Date(nowTick)
    const nowMs = ref.getTime()
    if (picksSegment === 'upcoming') {
      return allPoolGames
        .filter((m) => m.status === 'upcoming' && new Date(m.kickoff_time).getTime() > nowMs)
        .sort(compareKickoffAsc)
    }
    return allPoolGames
      .filter((m) => m.status === 'completed' || new Date(m.kickoff_time).getTime() < nowMs)
      .sort(compareKickoffDesc)
  }, [allPoolGames, picksSegment, nowTick])

  useEffect(() => {
    setGameIndex(0)
  }, [picksSegment])

  useEffect(() => {
    setGameIndex((i) => Math.min(i, Math.max(0, displayGames.length - 1)))
  }, [displayGames])

  const match = displayGames[gameIndex] ?? null

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

  useEffect(() => {
    if (!isMember || picksSegment !== 'past') {
      setPoolLeaderboard([])
      return
    }
    let cancelled = false
    void fetchPoolLeaderboard(supabase, poolId).then(({ rows, error }) => {
      if (cancelled || error) return
      setPoolLeaderboard(rows)
    })
    return () => {
      cancelled = true
    }
  }, [isMember, picksSegment, poolId, supabase])

  useEffect(() => {
    if (!match || picksSegment !== 'past') {
      setScoreExtrasByUser({})
      return
    }
    let cancelled = false
    void supabase
      .from('user_prediction_scores')
      .select('user_id, winner_points, margin_points')
      .eq('match_id', match.id)
      .then(({ data }) => {
        if (cancelled) return
        const next: Record<string, ScoreExtras> = {}
        for (const row of (data as { user_id: string; winner_points: unknown; margin_points: unknown }[] | null) ?? []) {
          const uid = String(row.user_id)
          next[uid] = {
            winner_points: Number(row.winner_points),
            margin_points: Number(row.margin_points),
          }
        }
        setScoreExtrasByUser(next)
      })
    return () => {
      cancelled = true
    }
  }, [match, picksSegment, supabase])

  const fixtureResultsTable = useMemo(() => {
    if (picksSegment !== 'past' || !match || poolRows.length === 0) return null
    const sortedLb = sortPoolLeaderboardRows(poolLeaderboard)
    const overallRank = rankByPointsDesc(
      sortedLb.map((r) => ({ user_id: r.user_id, points: Number.isFinite(r.total_points) ? r.total_points : null }))
    )
    const thisGameRank = rankByPointsDesc(
      poolRows.map((r) => ({
        user_id: r.user_id,
        points:
          r.reveal_allowed && r.score_total_points != null && Number.isFinite(Number(r.score_total_points))
            ? Number(r.score_total_points)
            : null,
      }))
    )
    const sorted = [...poolRows].sort((a, b) => {
      const pa =
        a.reveal_allowed && a.score_total_points != null ? Number(a.score_total_points) : Number.NEGATIVE_INFINITY
      const pb =
        b.reveal_allowed && b.score_total_points != null ? Number(b.score_total_points) : Number.NEGATIVE_INFINITY
      if (pb !== pa) return pb - pa
      return a.display_name.localeCompare(b.display_name)
    })
    return sorted.map((r) => ({
      row: r,
      thisGame: thisGameRank.get(r.user_id),
      overall: overallRank.get(r.user_id),
      bonus: scoreExtrasByUser[r.user_id]?.margin_points,
    }))
  }, [picksSegment, match, poolRows, poolLeaderboard, scoreExtrasByUser])

  const emptyCopy: Record<PoolPicksSegment, string> = {
    upcoming: 'No upcoming pool picks.',
    past: 'No past pool picks yet.',
  }

  const segmentBtn = (id: PoolPicksSegment, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={picksSegment === id}
      id={`pool-picks-seg-${id}`}
      onClick={() => setPicksSegment(id)}
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
        picksSegment === id ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-white/80'
      }`}
    >
      {label}
    </button>
  )

  const finalScoreLabel =
    match &&
    match.status === 'completed' &&
    match.home_score != null &&
    match.away_score != null &&
    Number.isFinite(match.home_score) &&
    Number.isFinite(match.away_score)
      ? `${match.home_score} – ${match.away_score}`
      : null

  if (!isMember) {
    return (
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Pool picks are only visible to pool members.
      </p>
    )
  }

  if (loadingGames) {
    return <p className="mt-4 text-sm text-gray-500">Loading pool games…</p>
  }

  return (
    <div className="mt-4 w-full max-w-full min-w-0 space-y-4 overflow-x-hidden">
      <div
        className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] pb-0.5"
        role="tablist"
        aria-label="Pool picks view"
      >
        <div className="inline-flex min-w-0 max-w-full gap-0.5 rounded-xl border border-gray-200 bg-gray-100/90 p-1">
          {segmentBtn('upcoming', 'Upcoming')}
          {segmentBtn('past', 'Past')}
        </div>
      </div>

      {picksError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{picksError}</p>
      ) : null}

      {displayGames.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {emptyCopy[picksSegment]}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 max-w-full">
              <h3 className="text-base font-black text-gray-900">
                {picksSegment === 'upcoming' ? 'Upcoming pool picks' : 'Past pool picks'}
              </h3>
            </div>
            <div className="flex min-w-0 w-full max-w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <label className="sr-only" htmlFor="pool-picks-game-select">
                Select game
              </label>
              <select
                id="pool-picks-game-select"
                value={gameIndex}
                onChange={(e) => setGameIndex(Number(e.target.value))}
                className="min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 sm:max-w-[min(100%,320px)]"
              >
                {displayGames.map((g, i) => (
                  <option key={g.id} value={i}>
                    {picksSegment === 'past' ? `${formatPoolPickDate(g.kickoff_time)} · ` : ''}
                    {g.home_team} vs {g.away_team}
                  </option>
                ))}
              </select>
              <div className="flex w-full min-w-0 items-center justify-center gap-1 sm:w-auto sm:justify-start">
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
                  Game {gameIndex + 1} of {displayGames.length}
                </span>
                <button
                  type="button"
                  aria-label="Next game"
                  disabled={gameIndex >= displayGames.length - 1}
                  onClick={() => setGameIndex((i) => Math.min(displayGames.length - 1, i + 1))}
                  className="inline-flex rounded-xl border border-gray-300 p-2 text-gray-800 disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {displayGames.length > 0 && match && loadingPicks ? (
        <p className="text-sm text-gray-500">Loading picks…</p>
      ) : null}

      {displayGames.length > 0 && match && !loadingPicks ? (
        <>
          {picksSegment === 'past' ? (
            <div className="w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Match</p>
              <p className="mt-1 text-sm text-gray-600">{formatPoolPickDate(match.kickoff_time)}</p>
              <p className="mt-2 text-lg font-black text-gray-900">
                {match.home_team}{' '}
                <span className="font-semibold text-gray-500">vs</span> {match.away_team}
              </p>
              <p className="mt-2 text-sm font-semibold text-gray-800">
                Final score:{' '}
                {finalScoreLabel != null ? (
                  <span className="tabular-nums">{finalScoreLabel}</span>
                ) : (
                  <span className="text-gray-500">Not available yet</span>
                )}
              </p>
            </div>
          ) : null}

          {!showPicksData ? (
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-lg shadow-black/10">
              <div className="grid min-w-0 grid-cols-3 gap-2 border-b border-gray-100 pb-6">
                <div className="min-w-0 text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Home</p>
                  <p className="mt-1 break-words font-semibold text-gray-900">{match.home_team}</p>
                </div>
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-xs tracking-widest text-gray-400">VS</span>
                  <span className="mt-1 text-xs text-gray-600">
                    {formatKickoffHm(match.kickoff_time) ?? 'Kickoff TBC'} · {match.status}
                  </span>
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs uppercase tracking-wide text-red-600">Away</p>
                  <p className="mt-1 break-words font-semibold text-gray-900">{match.away_team}</p>
                </div>
              </div>
              <p className="mt-6 text-center text-sm font-semibold text-gray-800">
                Picks will be visible once this game locks.
              </p>
            </div>
          ) : stats ? (
            <>
              <CommunityDistributionPanel stats={stats} viewerAvatar={viewerAvatar} />
              <div className="mt-4 w-full max-w-full min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
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

          {picksSegment === 'past' && fixtureResultsTable && fixtureResultsTable.length > 0 ? (
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h4 className="text-sm font-black text-gray-900">Fixture results (pool)</h4>
                <p className="mt-1 text-xs text-gray-600">
                  This game: rank by points on this fixture only. Overall: rank from the pool leaderboard (same tie
                  order as the Leaderboard tab).
                </p>
              </div>
              <div className="w-full max-w-full overflow-x-auto">
                <table className="min-w-[520px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600">
                      <th className="whitespace-nowrap px-4 py-3">Name</th>
                      <th className="whitespace-nowrap px-4 py-3">Margin</th>
                      <th className="whitespace-nowrap px-4 py-3">Bonus pts</th>
                      <th className="whitespace-nowrap px-4 py-3">Pts (game)</th>
                      <th className="whitespace-nowrap px-4 py-3">This game</th>
                      <th className="whitespace-nowrap px-4 py-3">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixtureResultsTable.map(({ row: r, thisGame, overall, bonus }) => {
                      const marginLabel = r.predicted_margin != null ? String(r.predicted_margin) : '—'
                      const ptsGame =
                        r.score_total_points != null && r.reveal_allowed ? String(r.score_total_points) : '—'
                      const bonusLabel =
                        bonus != null && Number.isFinite(bonus) ? bonus.toFixed(1) : '—'
                      const fmtRank = (n: number | null | undefined) =>
                        n == null ? '—' : String(n)
                      return (
                        <tr key={r.user_id} className="border-b border-gray-50">
                          <td className="max-w-[10rem] px-4 py-2 font-medium text-gray-900 sm:max-w-none">
                            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                              <LetterAvatar
                                letter={r.avatar_letter}
                                colour={r.avatar_colour}
                                avatarUrl={r.avatar_url}
                                displayName={r.display_name}
                                name={r.display_name}
                                size={24}
                                className="shrink-0 ring-1 ring-gray-200"
                              />
                              <span className="min-w-0 truncate" title={r.display_name}>
                                {r.display_name}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{marginLabel}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{bonusLabel}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{ptsGame}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{fmtRank(thisGame)}</td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-gray-800">{fmtRank(overall)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {showPicksData ? (
            <div className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <h4 className="text-sm font-black text-gray-900">Picks detail</h4>
              </div>
              <div className="w-full max-w-full overflow-x-auto">
                <table className="min-w-[640px] w-full text-left text-sm">
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
                          <td className="max-w-[10rem] px-4 py-2 font-medium text-gray-900 sm:max-w-none">
                            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                              <LetterAvatar
                                letter={r.avatar_letter}
                                colour={r.avatar_colour}
                                avatarUrl={r.avatar_url}
                                displayName={r.display_name}
                                name={r.display_name}
                                size={24}
                                className="shrink-0 ring-1 ring-gray-200"
                              />
                              <span className="min-w-0 truncate" title={r.display_name}>
                                {r.display_name}
                              </span>
                            </span>
                          </td>
                          <td className="max-w-[8rem] truncate px-4 py-2 text-gray-800 sm:max-w-none sm:whitespace-nowrap" title={winnerLabel}>
                            {winnerLabel}
                          </td>
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
