'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GameMatch } from '@/lib/public-prediction-game'
import {
  formatFixture,
  getMatchSummary,
  type Match as PredictorMatch,
  type PathResult,
  type PredictionResult,
  type Team as PredictorTeam,
} from '@/lib/prediction-model'
import { supabase } from '@/lib/supabase'

type ApiOk = {
  ok: true
  modelVersion: string
  fixtureHomeTeam: string
  fixtureAwayTeam: string
  season: number
  teams: PredictorTeam[]
  result: PredictionResult
}

type ApiErr = {
  ok: false
  error: string
  code?: string
}

type Props = {
  match: GameMatch | null
  onClose: () => void
}

function winnerLine(
  result: PredictionResult,
  homeName: string,
  awayName: string
): { line: string; marginRounded: number } {
  const m = Math.round(result.averageMargin)
  if (m > 0) return { line: `${homeName} by ${Math.abs(m)}`, marginRounded: m }
  if (m < 0) return { line: `${awayName} by ${Math.abs(m)}`, marginRounded: m }
  return { line: 'Projected draw', marginRounded: 0 }
}

export default function PredictionMarginModal({ match, onClose }: Props) {
  const open = match !== null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ApiOk | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!match) {
      setError('')
      setData(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setData(null)

    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) {
          setError('Session expired. Refresh and try again.')
          setLoading(false)
        }
        return
      }

      const res = await fetch('/api/admin/fixture-model-prediction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          kickoffTime: match.kickoff_time,
          season: new Date(match.kickoff_time).getFullYear(),
          homeTeamName: match.home_team,
          awayTeamName: match.away_team,
        }),
      })

      const json = (await res.json()) as ApiOk | ApiErr
      if (cancelled) return

      if (!res.ok || !('ok' in json) || !json.ok) {
        const err = json as ApiErr
        setError(err.error || 'Request failed')
        setLoading(false)
        return
      }

      setData(json)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [match])

  const matchesById = useMemo(() => {
    const m = new Map<number, PredictorMatch>()
    if (!data?.result) return m
    for (const row of data.result.relevantMatches) {
      m.set(row.id, row)
    }
    return m
  }, [data])

  if (!open) return null

  const body = data
  const result = body?.result
  const { line: winnerText } =
    result && body
      ? winnerLine(result, body.fixtureHomeTeam, body.fixtureAwayTeam)
      : { line: '' }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prediction-margin-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <h2 id="prediction-margin-modal-title" className="text-sm font-bold text-gray-900">
            Model prediction
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 px-4 py-3 text-sm text-gray-800">
          {match ? (
            <p className="text-xs text-gray-500">
              {match.home_team} vs {match.away_team}
            </p>
          ) : null}

          {loading ? (
            <p className="py-6 text-center text-gray-600">Loading model…</p>
          ) : error ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{error}</p>
          ) : body && result ? (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Predicted outcome</p>
                <p className="mt-1 text-base font-bold text-gray-900">{winnerText}</p>
                <p className="mt-1 text-xs text-gray-600">
                  Raw margin (home perspective):{' '}
                  <span className="font-mono tabular-nums">{result.averageMargin.toFixed(2)}</span>
                </p>
              </div>

              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Confidence</dt>
                  <dd className="font-semibold text-gray-900">{result.confidence}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Prediction type</dt>
                  <dd className="font-semibold capitalize text-gray-900">{result.type}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Model version</dt>
                  <dd className="font-mono text-gray-900">{body.modelVersion}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Season</dt>
                  <dd className="font-semibold text-gray-900">{body.season}</dd>
                </div>
                {result.type === 'indirect' ? (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Linked paths (total)</dt>
                    <dd className="font-semibold text-gray-900">{result.pathCount}</dd>
                  </div>
                ) : null}
              </dl>

              {result.type === 'direct' && result.directMatch ? (
                <div>
                  <p className="text-xs font-semibold text-gray-700">Direct result</p>
                  <p className="mt-1 rounded border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-800">
                    {formatFixture(result.directMatch, body.teams)}
                  </p>
                </div>
              ) : null}

              {result.type === 'indirect' && result.paths.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Top paths (by weight, same as public predictor)
                  </p>
                  <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
                    {result.paths.map((pr: PathResult, i: number) => (
                      <li key={i} className="rounded-lg border border-gray-100 bg-gray-50/80 p-2">
                        <p className="font-medium text-gray-900">
                          Path {i + 1} · {pr.path.length} link(s) · weight {pr.weight.toFixed(3)}
                        </p>
                        <ul className="mt-1 space-y-1 text-gray-700">
                          {pr.path.map((edge, j) => {
                            const mrow = matchesById.get(edge.matchId)
                            if (!mrow) return null
                            return (
                              <li key={j} className="rounded bg-white/80 px-2 py-1">
                                {getMatchSummary(mrow, edge.from, body.teams)}
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.type === 'indirect' && result.relevantMatches.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-700">Relevant fixtures (top paths)</p>
                  <ul className="mt-1 space-y-1 text-xs text-gray-700">
                    {result.relevantMatches.map((mrow) => (
                      <li key={mrow.id} className="rounded border border-gray-100 px-2 py-1">
                        {formatFixture(mrow, body.teams)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
