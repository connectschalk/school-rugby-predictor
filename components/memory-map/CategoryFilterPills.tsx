'use client'

import type { MemoryCategory } from '@/lib/memory-map/types'

type Props = {
  categories: MemoryCategory[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function CategoryFilterPills({ categories, selectedId, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          selectedId === null ? 'mm-btn-primary' : 'mm-btn-secondary'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
            selectedId === cat.id ? 'mm-btn-primary' : 'mm-btn-secondary'
          }`}
          style={selectedId === cat.id ? undefined : { borderColor: `${cat.colour}55` }}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
