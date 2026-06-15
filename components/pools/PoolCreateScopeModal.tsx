'use client'

import { useEffect, useMemo, useState } from 'react'
import ProvinceLogoMark from '@/components/ProvinceLogoMark'
import { filterCanonicalsForPickerQuery } from '@/lib/pool-picker-teams'
import CompetitionTeamLogo from '@/components/CompetitionTeamLogo'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import type { FixtureGroupRow } from '@/lib/pools'

type Tab = 'provinces' | 'events'

type Props = {
  open: boolean
  onClose: () => void
  provinces: FixtureGroupRow[]
  eventsAndLeagues: FixtureGroupRow[]
  selectedGroupIds: string[]
  onChangeSelectedGroupIds: (ids: string[]) => void
  /** group_id → canonical team names for that fixture group */
  groupTeams: Map<string, string[]>
  aliasKeyToCanonical: Map<string, string> | null
  selectedTeamNames: string[]
  onChangeSelectedTeamNames: (names: string[]) => void
  competitionSlug?: string | null
}

export default function PoolCreateScopeModal({
  open,
  onClose,
  provinces,
  eventsAndLeagues,
  selectedGroupIds,
  onChangeSelectedGroupIds,
  groupTeams,
  aliasKeyToCanonical,
  selectedTeamNames,
  onChangeSelectedTeamNames,
  competitionSlug = SCHOOLS_COMPETITION_SLUG,
}: Props) {
  const [tab, setTab] = useState<Tab>('provinces')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [teamSearch, setTeamSearch] = useState('')

  useEffect(() => {
    if (open) {
      setTab('provinces')
      setExpandedId(null)
      setTeamSearch('')
    }
  }, [open])

  const selectedTeamSet = useMemo(
    () => new Set(selectedTeamNames.map((s) => s.trim()).filter(Boolean)),
    [selectedTeamNames]
  )

  // NC temporarily hidden until sufficient team coverage (defence if callers pass full fixture list).
  const provincesForUi = useMemo(
    () => provinces.filter((p) => (p.slug ?? '').trim().toLowerCase() !== 'northern-cape'),
    [provinces]
  )

  const groupsForTab = tab === 'provinces' ? provincesForUi : eventsAndLeagues

  function toggleGroup(id: string, on: boolean) {
    onChangeSelectedGroupIds(
      on ? [...new Set([...selectedGroupIds, id])] : selectedGroupIds.filter((x) => x !== id)
    )
  }

  function toggleTeam(name: string) {
    const t = name.trim()
    if (!t) return
    if (selectedTeamSet.has(t)) {
      onChangeSelectedTeamNames(selectedTeamNames.filter((x) => x.trim() !== t))
    } else {
      onChangeSelectedTeamNames(
        [...new Set([...selectedTeamNames.map((x) => x.trim()), t])].sort((a, b) => a.localeCompare(b))
      )
    }
  }

  function selectAllInGroup(groupId: string) {
    const names = groupTeams.get(groupId) ?? []
    const merged = [...new Set([...selectedTeamNames.map((x) => x.trim()), ...names])].sort((a, b) =>
      a.localeCompare(b)
    )
    onChangeSelectedTeamNames(merged)
  }

  function clearTeamsInGroup(groupId: string) {
    const remove = new Set(groupTeams.get(groupId) ?? [])
    onChangeSelectedTeamNames(selectedTeamNames.filter((x) => !remove.has(x.trim())))
  }

  const expandedTeams = expandedId ? groupTeams.get(expandedId) ?? [] : []
  const filteredExpandedTeams = useMemo(
    () => filterCanonicalsForPickerQuery(expandedTeams, teamSearch, aliasKeyToCanonical),
    [expandedTeams, teamSearch, aliasKeyToCanonical]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-scope-modal-title"
        className="flex max-h-[min(90vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 id="pool-scope-modal-title" className="text-lg font-black text-gray-900">
            Add province / league / event
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-gray-100 px-3 py-2 sm:px-4">
          <button
            type="button"
            onClick={() => setTab('provinces')}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
              tab === 'provinces' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Provinces
          </button>
          <button
            type="button"
            onClick={() => setTab('events')}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
              tab === 'events' ? 'bg-gray-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Events / Competitions
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {groupsForTab.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nothing configured here yet.</p>
          ) : (
            <ul className="space-y-2">
              {groupsForTab.map((g) => {
                const expanded = expandedId === g.id
                const whole = selectedGroupIds.includes(g.id)
                const teams = groupTeams.get(g.id) ?? []
                return (
                  <li key={g.id} className="rounded-xl border border-gray-200 bg-gray-50/80">
                    <div className="flex flex-wrap items-center gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : g.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition hover:bg-white/80"
                      >
                        {tab === 'provinces' ? (
                          <ProvinceLogoMark label={g.name} slug={g.slug} size={36} className="shadow-sm" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-xs font-black text-white">
                            {g.name.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 font-semibold text-gray-900">{g.name}</span>
                        <span className="text-xs font-medium text-gray-500">{expanded ? '▲' : '▼'}</span>
                      </button>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800">
                        <input
                          type="checkbox"
                          checked={whole}
                          onChange={(e) => toggleGroup(g.id, e.target.checked)}
                        />
                        Whole group
                      </label>
                    </div>
                    {expanded ? (
                      <div className="border-t border-gray-200 bg-white px-3 pb-3 pt-2">
                        <p className="text-[11px] font-medium text-gray-500">
                          Pick individual schools ({teams.length} in directory) or use Whole group above.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => selectAllInGroup(g.id)}
                            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-100"
                          >
                            Select all listed
                          </button>
                          <button
                            type="button"
                            onClick={() => clearTeamsInGroup(g.id)}
                            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-800 hover:bg-gray-100"
                          >
                            Clear listed from pool
                          </button>
                        </div>
                        <input
                          type="search"
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                          placeholder="Search team..."
                          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        {teams.length === 0 ? (
                          <p className="mt-3 text-sm text-gray-500">
                            No team list for this group in the directory yet. You can still use Whole group.
                          </p>
                        ) : (
                          <div className="mt-2 grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                            {filteredExpandedTeams.map((name) => {
                              const sel = selectedTeamSet.has(name)
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => toggleTeam(name)}
                                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${
                                    sel
                                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                                      : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300'
                                  }`}
                                >
                                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100">
                                    <CompetitionTeamLogo
                                      competitionSlug={competitionSlug}
                                      teamName={name}
                                      size={24}
                                      variant="crest"
                                    />
                                    {sel ? (
                                      <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-600 text-[8px] font-black leading-[14px] text-white">
                                        ✓
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{name}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-900 px-6 py-2 text-sm font-bold text-white shadow hover:bg-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
