'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureDefaultMemoryArea } from '@/lib/memory-map/mutations'
import { customAreas, isSystemDefaultArea } from '@/lib/memory-map/default-area'
import type { AdminTab, MemoryArea, MemoryMap, MemoryPin, MemoryStory } from '@/lib/memory-map/types'

type Props = {
  mapId: string
  map: MemoryMap
  areas: MemoryArea[]
  pins: MemoryPin[]
  stories: MemoryStory[]
  onCreateArea: () => void
  onDrawArea: () => void
  onEditArea: (area: MemoryArea) => void
  onNavigate: (tab: AdminTab, options?: { areaFilterId?: string }) => void
  onEnsureComplete: () => void
}

export default function AdminAreasPanel({
  mapId,
  areas,
  pins,
  stories,
  onCreateArea,
  onDrawArea,
  onEditArea,
  onNavigate,
  onEnsureComplete,
}: Props) {
  const custom = customAreas(areas)
  const generalArea = areas.find((a) => a.is_active && isSystemDefaultArea(a))
  const unassignedPinCount = generalArea
    ? pins.filter((p) => p.area_id === generalArea.id && !['deleted', 'archived'].includes(p.status)).length
    : 0
  const unassignedStoryCount = generalArea
    ? stories.filter((s) => {
        const pin = pins.find((p) => p.id === s.pin_id)
        return pin?.area_id === generalArea.id && !['deleted', 'archived'].includes(s.status)
      }).length
    : 0

  useEffect(() => {
    if (areas.some((a) => a.is_active)) return
    void ensureDefaultMemoryArea(supabase, mapId).then(({ error }) => {
      if (!error) onEnsureComplete()
    })
  }, [areas, mapId, onEnsureComplete])

  return (
    <div className="space-y-4">
      <div className="mm-card rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-base font-black">Organise your Memory Map into areas</h2>
        <p className="mm-muted mt-2 text-sm leading-relaxed">
          Areas help group memories by place, for example Main Campus, Rugby Field, Hostel, Hall or Off-site Fields.
          You can create areas now, or add memories first and organise them later.
        </p>

        <ol className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="mm-text-accent font-black">1.</span>
            <span>Set the default map point</span>
          </li>
          <li className="flex gap-2">
            <span className="mm-text-accent font-black">2.</span>
            <span>Draw or create areas</span>
          </li>
          <li className="flex gap-2">
            <span className="mm-text-accent font-black">3.</span>
            <span>Assign pins and memories to areas</span>
          </li>
        </ol>

        <p className="mm-muted mt-4 text-xs leading-relaxed">
          An area is not required before content is added. New content can go into a General area and be organised
          later.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onCreateArea} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold">
            Create area
          </button>
          <button type="button" onClick={onDrawArea} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
            Draw area on map
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pins', { areaFilterId: generalArea?.id })}
            className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold"
          >
            View unassigned memories
          </button>
        </div>

        {generalArea && (unassignedPinCount > 0 || unassignedStoryCount > 0) ? (
          <p className="mm-muted mt-3 text-xs">
            General area: {unassignedPinCount} pin{unassignedPinCount === 1 ? '' : 's'}, {unassignedStoryCount} memor
            {unassignedStoryCount === 1 ? 'y' : 'ies'} not yet organised into custom areas.
          </p>
        ) : null}
      </div>

      {generalArea ? (
        <div className="mm-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">{generalArea.name}</p>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase text-white/60">
              Default
            </span>
          </div>
          <p className="mm-muted mt-1 text-xs">{generalArea.description}</p>
          <p className="mm-muted mt-2 text-[10px]">System area for new content before custom areas are set up.</p>
        </div>
      ) : null}

      {custom.length === 0 ? (
        <p className="mm-muted rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-sm">
          No custom areas yet. Add content now and organise it into areas when you are ready.
        </p>
      ) : (
        custom.map((area) => (
          <div key={area.id} className="mm-card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">{area.name}</p>
              <span className="text-xs uppercase text-white/60">{area.is_active ? area.map_type : 'archived'}</span>
            </div>
            <p className="mm-muted mt-1 text-xs">{area.description}</p>
            {area.bounds ? (
              <p className="mm-muted mt-1 text-[10px]">Map bounds saved</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onEditArea(area)} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">
                Edit
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
