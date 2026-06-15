'use client'

import { useEffect, useMemo, useState } from 'react'
import CompetitionImportPanel from '@/components/admin/CompetitionImportPanel'
import CompetitionTeamLogo, { CompetitionMatchTeams } from '@/components/CompetitionTeamLogo'
import {
  adminCompetitionFetch,
  formatKickoffDisplay,
  isKickoffToday,
} from '@/lib/admin-competition-api-client'
import type { AdminFixtureRow } from '@/lib/admin-competition-stats'

type Props = {
  competitionSlug: string
  fixtures: AdminFixtureRow[]
  onRefresh: () => void | Promise<void>
}

type ResultFilter = 'all' | 'needs' | 'completed' | 'today'

type RowState = {
  home: string
  away: string
  editing: boolean
  message: string
  messageType: 'ok' | 'warn' | 'error'
  busy: boolean
}

function initialRowState(f: AdminFixtureRow): RowState {
  return {
    home: f.home_score != null ? String(f.home_score) : '',
    away: f.away_score != null ? String(f.away_score) : '',
    editing: f.status !== 'completed',
    message: '',
    messageType: 'ok',
    busy: false,
  }
}

export default function CompetitionResultsPanel({ competitionSlug, fixtures, onRefresh }: Props) {
  const [filter, setFilter] = useState<ResultFilter>('needs')
  const [search, setSearch] = useState('')
  const [rowState, setRowState] = useState<Record<string, RowState>>({})

  useEffect(() => {
    setRowState((prev) => {
      const next: Record<string, RowState> = {}
      for (const f of fixtures) {
        const existing = prev[f.id]
        if (existing && !existing.busy) {
          next[f.id] = {
            ...existing,
            home: f.home_score != null ? String(f.home_score) : existing.home,
            away: f.away_score != null ? String(f.away_score) : existing.away,
            editing: f.status !== 'completed' ? true : existing.editing,
          }
        } else if (!existing || !existing.busy) {
          next[f.id] = initialRowState(f)
        } else {
          next[f.id] = existing
        }
      }
      return next
    })
  }, [fixtures])

  const activeFixtures = useMemo(
    () => fixtures.filter((f) => f.status !== 'cancelled'),
    [fixtures]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activeFixtures.filter((f) => {
      if (q && !f.home_team.toLowerCase().includes(q) && !f.away_team.toLowerCase().includes(q)) {
        return false
      }
      if (filter === 'completed') return f.status === 'completed'
      if (filter === 'needs') return f.status !== 'completed'
      if (filter === 'today') return isKickoffToday(f.kickoff_time)
      return true
    })
  }, [activeFixtures, filter, search])

  function getRow(f: AdminFixtureRow): RowState {
    return rowState[f.id] ?? initialRowState(f)
  }

  function patchRow(id: string, patch: Partial<RowState>) {
    setRowState((prev) => {
      const base = prev[id] ?? initialRowState(fixtures.find((x) => x.id === id)!)
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  async function saveResult(f: AdminFixtureRow) {
    const row = getRow(f)
    const homeScore = Number(row.home)
    const awayScore = Number(row.away)
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      patchRow(f.id, { message: 'Enter valid non-negative scores.', messageType: 'error' })
      return
    }

    patchRow(f.id, { busy: true, message: '' })
    try {
      const res = await adminCompetitionFetch(
        `/api/admin/competitions/${competitionSlug}/fixtures/${f.id}/result`,
        { method: 'POST', body: JSON.stringify({ home_score: homeScore, away_score: awayScore }) }
      )
      const json = (await res.json()) as {
        ok?: boolean
        error?: string
        message?: string
        result_saved?: boolean
        scored?: boolean
        scoring_error?: string
      }

      if (!json.result_saved) {
        patchRow(f.id, {
          busy: false,
          message: json.error ?? 'Could not save result',
          messageType: 'error',
        })
        return
      }

      if (json.scored) {
        patchRow(f.id, {
          busy: false,
          editing: false,
          message: json.message ?? 'Result saved and predictions scored.',
          messageType: 'ok',
        })
      } else {
        patchRow(f.id, {
          busy: false,
          editing: false,
          message: json.message ?? 'Result saved, but scoring failed. Please retry scoring.',
          messageType: 'warn',
        })
      }
      await onRefresh()
    } catch (e) {
      patchRow(f.id, {
        busy: false,
        message: e instanceof Error ? e.message : 'Could not save result',
        messageType: 'error',
      })
    }
  }

  async function retryScoring(f: AdminFixtureRow) {
    patchRow(f.id, { busy: true, message: '' })
    try {
      const res = await adminCompetitionFetch(
        `/api/admin/competitions/${competitionSlug}/fixtures/${f.id}/score`,
        { method: 'POST', body: '{}' }
      )
      const json = (await res.json()) as {
        ok?: boolean
        error?: string
        message?: string
        scored?: boolean
        scoring_error?: string
      }
      if (!res.ok || !json.scored) {
        patchRow(f.id, {
          busy: false,
          message: json.scoring_error ?? json.error ?? 'Scoring failed. Please try again.',
          messageType: 'warn',
        })
        return
      }
      patchRow(f.id, {
        busy: false,
        message: json.message ?? 'Predictions scored.',
        messageType: 'ok',
      })
      await onRefresh()
    } catch (e) {
      patchRow(f.id, {
        busy: false,
        message: e instanceof Error ? e.message : 'Scoring failed',
        messageType: 'warn',
      })
    }
  }

  const filters: { id: ResultFilter; label: string }[] = [
    { id: 'needs', label: 'Needs Result' },
    { id: 'today', label: 'Today' },
    { id: 'completed', label: 'Completed' },
    { id: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">Match results</h3>
        <p className="mt-1 text-sm text-gray-600">
          Enter scores manually as matches finish. Saving marks the fixture completed and scores
          predictions automatically.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === f.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        {filtered.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">No fixtures match this filter.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {filtered.map((f) => {
              const row = getRow(f)
              const completed = f.status === 'completed'
              const inputsDisabled = completed && !row.editing

              return (
                <li
                  key={f.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/80 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500">
                        {formatKickoffDisplay(f.kickoff_time)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-gray-900">
                        <CompetitionMatchTeams
                          competitionSlug={competitionSlug}
                          homeTeam={f.home_team}
                          awayTeam={f.away_team}
                          size={24}
                          layout="versus"
                        />
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Status:{' '}
                        <span className="font-semibold text-gray-700">{f.status}</span>
                        {completed && f.home_score != null && f.away_score != null ? (
                          <>
                            {' '}
                            · Current: {f.home_score}–{f.away_score}
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                        <CompetitionTeamLogo
                          competitionSlug={competitionSlug}
                          teamName={f.home_team}
                          size={20}
                        />
                        Home
                        <input
                          type="number"
                          min={0}
                          disabled={inputsDisabled || row.busy}
                          value={row.home}
                          onChange={(e) => patchRow(f.id, { home: e.target.value })}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                        />
                      </label>
                      <span className="text-gray-400">–</span>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                        <CompetitionTeamLogo
                          competitionSlug={competitionSlug}
                          teamName={f.away_team}
                          size={20}
                        />
                        Away
                        <input
                          type="number"
                          min={0}
                          disabled={inputsDisabled || row.busy}
                          value={row.away}
                          onChange={(e) => patchRow(f.id, { away: e.target.value })}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                        />
                      </label>

                      {completed && !row.editing ? (
                        <button
                          type="button"
                          onClick={() => patchRow(f.id, { editing: true })}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50"
                        >
                          Edit Result
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={row.busy}
                          onClick={() => void saveResult(f)}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          {row.busy ? 'Saving…' : 'Save Result'}
                        </button>
                      )}

                      {row.messageType === 'warn' ? (
                        <button
                          type="button"
                          disabled={row.busy}
                          onClick={() => void retryScoring(f)}
                          className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
                        >
                          Retry Scoring
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {row.message ? (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        row.messageType === 'ok'
                          ? 'text-emerald-700'
                          : row.messageType === 'warn'
                            ? 'text-amber-800'
                            : 'text-red-700'
                      }`}
                    >
                      {row.message}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-gray-900">
          Advanced: Import Results File
        </summary>
        <p className="mt-3 text-sm text-gray-600">
          Bulk upload for backfill or migration. Normal tournament workflow is manual entry above.
        </p>
        <div className="mt-4">
          <CompetitionImportPanel
            competitionSlug={competitionSlug}
            kind="results"
            onSuccess={onRefresh}
          />
        </div>
      </details>
    </div>
  )
}
