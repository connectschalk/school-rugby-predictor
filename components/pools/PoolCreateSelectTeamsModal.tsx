'use client'

import { useEffect, useMemo, useState } from 'react'
import { filterCanonicalsForPickerQuery } from '@/lib/pool-picker-teams'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'

type Props = {
  open: boolean
  onClose: () => void
  allCanonicalNames: string[]
  aliasKeyToCanonical: Map<string, string> | null
  initialSelected: string[]
  onDone: (names: string[]) => void
}

export default function PoolCreateSelectTeamsModal({
  open,
  onClose,
  allCanonicalNames,
  aliasKeyToCanonical,
  initialSelected,
  onDone,
}: Props) {
  const [draft, setDraft] = useState<string[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    if (open) {
      setDraft([...initialSelected].sort((a, b) => a.localeCompare(b)))
      setQ('')
    }
  }, [open, initialSelected])

  const filtered = useMemo(
    () => filterCanonicalsForPickerQuery(allCanonicalNames, q, aliasKeyToCanonical),
    [allCanonicalNames, q, aliasKeyToCanonical]
  )

  const selectedSet = useMemo(() => new Set(draft.map((s) => s.trim()).filter(Boolean)), [draft])

  function toggle(name: string) {
    const t = name.trim()
    if (!t) return
    if (selectedSet.has(t)) {
      setDraft((prev) => prev.filter((x) => x.trim() !== t))
    } else {
      setDraft((prev) => [...new Set([...prev.map((x) => x.trim()), t])].sort((a, b) => a.localeCompare(b)))
    }
  }

  function finalize() {
    onDone(draft)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={finalize}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-select-teams-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 id="pool-select-teams-title" className="text-lg font-black text-gray-900">
            Select teams
          </h2>
          <button
            type="button"
            onClick={finalize}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {draft.length > 0 ? (
          <div className="shrink-0 border-b border-gray-100 bg-gray-50/90 px-4 py-3 sm:px-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Selected</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-600 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-950 shadow-sm"
                >
                  <span className="max-w-[200px] truncate">{name}</span>
                  <span className="text-emerald-700">×</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team..."
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((name) => {
              const sel = selectedSet.has(name)
              const logo = getSchoolTeamLogoPath(name)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition ${
                    sel
                      ? 'border-emerald-600 bg-emerald-50/90 text-emerald-950 shadow-inner ring-1 ring-emerald-500/30'
                      : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static public assets
                      <img src={logo} alt="" className="h-9 w-9 object-contain" draggable={false} />
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400">?</span>
                    )}
                    {sel ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-black text-white shadow">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{name}</span>
                </button>
              )
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No teams match your search.</p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={finalize}
            className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-bold text-white shadow hover:bg-black"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
