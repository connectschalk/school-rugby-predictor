'use client'

import type { YearFilterKey } from '@/lib/memory-map/utils'

type Props = {
  value: YearFilterKey
  customYear: string
  onChange: (key: YearFilterKey) => void
  onCustomYear: (year: string) => void
}

const OPTIONS: { key: YearFilterKey; label: string }[] = [
  { key: 'all', label: 'All years' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_5', label: 'Last 5 years' },
  { key: 'archive', label: 'Archive' },
]

export default function YearFilterPills({ value, customYear, onChange, onCustomYear }: Props) {
  return (
    <div className="space-y-2 px-4">
      <div className="flex gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              value === opt.key ? 'mm-btn-primary' : 'mm-btn-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('custom')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
            value === 'custom' ? 'mm-btn-primary' : 'mm-btn-secondary'
          }`}
        >
          Custom year
        </button>
      </div>
      {value === 'custom' ? (
        <input
          type="number"
          value={customYear}
          onChange={(e) => onCustomYear(e.target.value)}
          placeholder="e.g. 1998"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      ) : null}
    </div>
  )
}
