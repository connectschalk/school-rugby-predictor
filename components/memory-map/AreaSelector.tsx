'use client'

import type { MemoryArea } from '@/lib/memory-map/types'

type Props = {
  areas: MemoryArea[]
  selectedAreaId: string | null
  onSelect: (areaId: string) => void
}

export default function AreaSelector({ areas, selectedAreaId, onSelect }: Props) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {areas.map((area) => {
        const active = area.id === selectedAreaId
        return (
          <button
            key={area.id}
            type="button"
            onClick={() => onSelect(area.id)}
            className={`mm-card rounded-2xl p-4 text-left transition ${
              active ? 'ring-2 ring-[var(--mm-accent)]' : 'hover:border-white/25'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold">{area.name}</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                {area.map_type === 'geo' ? 'Geo Map' : 'School Map'}
              </span>
            </div>
            {area.description ? <p className="mm-muted mt-1 text-xs">{area.description}</p> : null}
            <p className="mm-muted mt-3 text-xs">
              {area.pin_count ?? 0} pins · {area.story_count ?? 0} stories
            </p>
          </button>
        )
      })}
    </div>
  )
}
