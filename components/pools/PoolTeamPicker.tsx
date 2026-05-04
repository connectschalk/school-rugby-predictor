'use client'

import { useMemo, useState } from 'react'
import { filterCanonicalsForPickerQuery } from '@/lib/pool-picker-teams'

type Props = {
  allTeams: string[]
  selected: string[]
  onChange: (names: string[]) => void
  disabled?: boolean
  /** Normalized alias keys → canonical display (search matches aliases; values are never raw aliases). */
  aliasKeyToCanonical?: Map<string, string> | null
}

export default function PoolTeamPicker({
  allTeams,
  selected,
  onChange,
  disabled,
  aliasKeyToCanonical = null,
}: Props) {
  const [q, setQ] = useState('')
  const selectedSet = useMemo(() => new Set(selected.map((s) => s.trim()).filter(Boolean)), [selected])

  const filtered = useMemo(
    () => filterCanonicalsForPickerQuery(allTeams, q, aliasKeyToCanonical),
    [allTeams, q, aliasKeyToCanonical]
  )

  function toggle(name: string) {
    if (disabled) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (selectedSet.has(trimmed)) {
      onChange(selected.filter((x) => x.trim() !== trimmed))
    } else {
      onChange([...selected.filter((x) => x.trim()), trimmed].sort((a, b) => a.localeCompare(b)))
    }
  }

  function selectAllFiltered() {
    if (disabled) return
    onChange([...new Set([...selected.map((s) => s.trim()), ...filtered])].sort((a, b) => a.localeCompare(b)))
  }

  function clearAll() {
    if (disabled) return
    onChange([])
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2">
          {selected.map((name) => {
            const t = name.trim()
            if (!t) return null
            return (
              <span
                key={t}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-300 bg-gray-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-gray-900"
              >
                <span className="truncate">{t}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((x) => x.trim() !== t))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      <input
        type="search"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search teams or nicknames…"
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || filtered.length === 0}
          onClick={() => selectAllFiltered()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
        >
          Select all{q.trim() ? ' (filtered)' : ''}
        </button>
        <button
          type="button"
          disabled={disabled || selected.length === 0}
          onClick={() => clearAll()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
        >
          Clear all
        </button>
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/50 p-1">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-center text-sm text-gray-500">No teams match your search.</li>
        ) : (
          filtered.map((name) => (
            <li key={name}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selectedSet.has(name)}
                  onChange={() => toggle(name)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-900">{name}</span>
              </label>
            </li>
          ))
        )}
      </ul>
      <p className="text-xs text-gray-500">
        {selected.length} team{selected.length === 1 ? '' : 's'} selected. Picks are stored as canonical names from the
        teams directory.
      </p>
    </div>
  )
}
