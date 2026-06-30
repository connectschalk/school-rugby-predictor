'use client'

import { useEffect, useId, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchSoccerScoringBreakdown,
  type SoccerScoringBreakdownResult,
} from '@/lib/soccer-scoring-breakdown'
import SoccerScoringRulesBody from '@/components/competitions/SoccerScoringRulesBody'
import { fetchEffectivePoolMatches } from '@/lib/pools'

export type SoccerScoringBreakdownTarget = {
  userId: string
  displayName: string
  poolId?: string
  poolJoinedAt?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  client: SupabaseClient
  target: SoccerScoringBreakdownTarget | null
  competitionId: string
  competitionSlug: string
  season?: number
}

function formatKickoff(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function SoccerScoringBreakdownModal({
  open,
  onClose,
  client,
  target,
  competitionId,
  competitionSlug,
  season,
}: Props) {
  const titleId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [breakdown, setBreakdown] = useState<SoccerScoringBreakdownResult | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || !target) {
      setBreakdown(null)
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setBreakdown(null)

    void (async () => {
      let poolMatchIds: string[] | undefined
      if (target.poolId) {
        const { matchIds, error: poolErr } = await fetchEffectivePoolMatches(client, target.poolId)
        if (poolErr) {
          if (!cancelled) {
            setError(poolErr.message)
            setLoading(false)
          }
          return
        }
        poolMatchIds = matchIds
      }

      const { data, error: fetchErr } = await fetchSoccerScoringBreakdown(client, {
        userId: target.userId,
        competitionId,
        competitionSlug,
        displayName: target.displayName,
        season,
        poolMatchIds,
        poolJoinedAt: target.poolJoinedAt,
      })

      if (cancelled) return
      if (fetchErr) {
        setError(fetchErr.message)
        setBreakdown(null)
      } else {
        setBreakdown(data)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, target, client, competitionId, competitionSlug, season])

  if (!open || !target) return null

  const playerName = target.displayName.trim() || 'Player'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-gray-900 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <h2 id={titleId} className="text-left text-lg font-bold text-gray-900">
            Scoring breakdown · {playerName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4 text-left text-sm leading-relaxed text-gray-800">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading scoring breakdown…</p>
          ) : error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
          ) : breakdown ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Total points</dt>
                  <dd className="mt-0.5 text-lg font-black tabular-nums text-gray-900">
                    {breakdown.stats.totalPoints}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Exact scores</dt>
                  <dd className="mt-0.5 text-lg font-black tabular-nums text-gray-900">
                    {breakdown.stats.exactScores}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Correct results</dt>
                  <dd className="mt-0.5 text-lg font-black tabular-nums text-gray-900">
                    {breakdown.stats.correctResults}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Picks scored</dt>
                  <dd className="mt-0.5 text-lg font-black tabular-nums text-gray-900">
                    {breakdown.stats.picksScored}
                  </dd>
                </div>
              </dl>

              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{breakdown.summaryText}</p>

              <div>
                <h3 className="text-sm font-bold text-gray-900">Scored picks</h3>
                {breakdown.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-600">No scored picks found for this scope.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {breakdown.rows.map((row) => (
                      <li
                        key={row.matchId}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
                      >
                        <p className="font-semibold text-gray-900">{row.matchLabel}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{formatKickoff(row.kickoffTime)}</p>
                        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs text-gray-500">Prediction</dt>
                            <dd className="font-medium tabular-nums text-gray-900">{row.predictionLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Actual</dt>
                            <dd className="font-medium tabular-nums text-gray-900">{row.actualLabel}</dd>
                          </div>
                          {row.penaltyWinnerLabel ? (
                            <div className="sm:col-span-2">
                              <dt className="text-xs text-gray-500">Penalty winner</dt>
                              <dd className="font-medium text-gray-900">{row.penaltyWinnerLabel}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-xs text-gray-500">Points</dt>
                            <dd className="font-bold tabular-nums text-gray-900">{row.points}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Outcome</dt>
                            <dd className="font-medium text-gray-900">{row.outcomeLabel}</dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-gray-500">Reason</dt>
                            <dd className="font-medium text-gray-800">{row.reasonLabel}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-bold text-gray-900">Soccer scoring</h3>
                <div className="mt-3">
                  <SoccerScoringRulesBody showTitle={false} showLeaderboardNote={false} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
