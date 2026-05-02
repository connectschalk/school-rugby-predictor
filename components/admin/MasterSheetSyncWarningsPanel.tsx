'use client'

import { useMemo, useState } from 'react'
import {
  countWarningsByCategory,
  filterSyncWarnings,
  type SyncWarningFilter,
  type SyncWarningItem,
} from '@/lib/sync-master-warnings'

const FILTER_OPTIONS: { id: SyncWarningFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical errors' },
  { id: 'group_link', label: 'Group / link' },
  { id: 'duplicate', label: 'Duplicates' },
  { id: 'team_date', label: 'Team / date' },
  { id: 'province', label: 'Province' },
]

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    group_link: 'Group link',
    province: 'Province',
    duplicate: 'Duplicate',
    team_date: 'Team / date',
    validation: 'Validation',
    insert: 'Insert',
    update: 'Update',
  }
  return map[c] ?? c
}

export default function MasterSheetSyncWarningsPanel({
  items,
  defaultOpen,
  title = 'Warnings / errors',
}: {
  items: SyncWarningItem[]
  defaultOpen: boolean
  title?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [filter, setFilter] = useState<SyncWarningFilter>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => countWarningsByCategory(items), [items])
  const errorCount = useMemo(() => items.filter((w) => w.severity === 'error').length, [items])
  const filtered = useMemo(
    () => filterSyncWarnings(items, filter, search),
    [items, filter, search]
  )

  const total = items.length

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-gray-900 md:px-4"
        aria-expanded={open}
      >
        <span>
          {title}
          {total > 0 ? (
            <span className="ml-2 font-normal text-gray-600">
              ({total}
              {errorCount > 0 ? (
                <span className="ml-1 text-red-700">
                  · {errorCount} error{errorCount === 1 ? '' : 's'}
                </span>
              ) : null}
              )
            </span>
          ) : (
            <span className="ml-2 font-normal text-gray-500">(none)</span>
          )}
        </span>
        <span className="text-gray-500">{open ? '▼' : '▶'}</span>
      </button>

      {open && total > 0 ? (
        <div className="border-t border-gray-100 px-3 pb-4 pt-2 md:px-4">
          <div className="flex flex-wrap gap-1.5 text-[10px] md:text-[11px]">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([k, n]) =>
              n > 0 ? (
                <span
                  key={k}
                  className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700"
                  title={categoryLabel(k)}
                >
                  {categoryLabel(k)}: {n}
                </span>
              ) : null
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap gap-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition md:text-xs ${
                    filter === opt.id
                      ? 'bg-gray-900 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team, date, text…"
              className="min-h-[2.25rem] w-full min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs md:max-w-xs"
            />
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Showing {filtered.length} of {total}
          </p>

          <div className="mt-2 max-h-[min(480px,55vh)] overflow-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[600px] border-collapse text-left text-[11px] md:text-xs">
              <thead className="sticky top-0 z-[1] bg-gray-50 text-gray-600">
                <tr>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">Type</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">Category</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">Fixture</th>
                  <th className="whitespace-nowrap px-2 py-2 font-semibold">Date</th>
                  <th className="min-w-[200px] px-2 py-2 font-semibold">Message</th>
                  <th className="min-w-[140px] px-2 py-2 font-semibold">Suggested fix</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w, i) => (
                  <tr key={`${w.message}-${i}`} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-2 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          w.severity === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {w.severity}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-gray-800">{categoryLabel(w.category)}</td>
                    <td className="px-2 py-2 text-gray-800">
                      {w.home_team && w.away_team ? (
                        <>
                          {w.home_team} <span className="text-gray-400">vs</span> {w.away_team}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-gray-700">{w.date ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-800">
                      <span className="break-words">{w.message}</span>
                      {w.sheet_row != null ? (
                        <span className="mt-0.5 block text-[10px] text-gray-500">Sheet row ~{w.sheet_row}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {w.suggested_fix ? <span className="break-words">{w.suggested_fix}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {open && total === 0 ? (
        <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">No warnings for this run.</p>
      ) : null}
    </div>
  )
}
