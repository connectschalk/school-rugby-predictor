'use client'

import { useMemo, useState } from 'react'
import type { MemoryArea, MemoryMap, MemoryPin, MemoryStory } from '@/lib/memory-map/types'
import { getImageMapInitialFocus } from '@/lib/memory-map/map-starting-point'
import { areaGroup, areaMapTypeLabel, type AreaGroup } from '@/lib/memory-map/utils'
import MmEmptyState from '@/components/memory-map/MmEmptyState'

type Props = {
  areas: MemoryArea[]
  pins: MemoryPin[]
  stories: MemoryStory[]
  map?: MemoryMap
  selectedAreaId: string | null
  onSelect: (areaId: string) => void
}

const GROUP_LABELS: Record<AreaGroup, string> = {
  outdoor: 'Outdoor areas',
  indoor: 'Indoor areas',
  offsite: 'Off-site areas',
}

export default function AreaSelector({ areas, pins, stories, map, selectedAreaId, onSelect }: Props) {
  const [groupFilter, setGroupFilter] = useState<AreaGroup | 'all'>('all')

  const activeAreas = useMemo(() => areas.filter((a) => a.is_active), [areas])

  const filtered = useMemo(() => {
    if (groupFilter === 'all') return activeAreas
    return activeAreas.filter((a) => areaGroup(a) === groupFilter)
  }, [activeAreas, groupFilter])

  const groups = useMemo(() => {
    const set = new Set(activeAreas.map(areaGroup))
    return (['outdoor', 'indoor', 'offsite'] as AreaGroup[]).filter((g) => set.has(g))
  }, [activeAreas])

  if (activeAreas.length === 0) {
    return (
      <MmEmptyState
        title="No areas have been published yet"
        description="An admin can add areas from the admin dashboard."
        icon="🗺️"
      />
    )
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      {groups.length > 1 ? (
        <div className="flex gap-2 mm-hide-scrollbar">
          <button
            type="button"
            onClick={() => setGroupFilter('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${groupFilter === 'all' ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
          >
            All areas
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupFilter(g)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${groupFilter === g ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((area) => {
          const active = area.id === selectedAreaId
          const areaPinIds = new Set(pins.filter((p) => p.area_id === area.id && p.status === 'approved').map((p) => p.id))
          const areaStories = stories.filter((s) => areaPinIds.has(s.pin_id) && s.status === 'approved')
          const latestYear =
            areaStories.length > 0 ? Math.max(...areaStories.map((s) => s.event_year)) : null
          const thumb = area.map_image_url ?? map?.landing_background_url
          const imageFocus = area.map_type === 'image' ? getImageMapInitialFocus(area) : null

          return (
            <button
              key={area.id}
              type="button"
              onClick={() => onSelect(area.id)}
              className={`mm-card overflow-hidden rounded-2xl text-left transition ${
                active ? 'mm-ring-accent-2' : 'hover:border-white/25'
              }`}
            >
              <div
                className="h-24 bg-cover bg-center"
                style={{
                  backgroundImage: thumb
                    ? `linear-gradient(180deg, transparent 0%, rgba(5,8,13,0.85) 100%), url(${thumb})`
                    : area.map_type === 'geo'
                      ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)'
                      : 'linear-gradient(135deg, #14532d 0%, #0f172a 100%)',
                  backgroundPosition: imageFocus ? `${imageFocus.x}% ${imageFocus.y}%` : 'center',
                }}
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-snug">{area.name}</h3>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                    {areaMapTypeLabel(area)}
                  </span>
                </div>
                {area.description ? <p className="mm-muted mt-1 line-clamp-2 text-xs">{area.description}</p> : null}
                <div className="mm-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  <span>{area.pin_count ?? 0} pins</span>
                  <span>{area.story_count ?? 0} stories</span>
                  {area.story_count ? <span>Latest {latestYear ?? '—'}</span> : null}
                </div>
                {map?.sponsor_name ? (
                  <p className="mt-2 truncate text-[10px] text-white/50">Sponsored · {map.sponsor_name}</p>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
