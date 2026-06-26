'use client'

import { useMemo, useState } from 'react'
import type { MemoryMapBundle } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import AreaSelector from '@/components/memory-map/AreaSelector'
import CategoryFilterPills from '@/components/memory-map/CategoryFilterPills'
import MapTypeToggle from '@/components/memory-map/MapTypeToggle'
import MapCanvas from '@/components/memory-map/MapCanvas'
import PinPreviewSheet from '@/components/memory-map/PinPreviewSheet'
import type { MemoryPin } from '@/lib/memory-map/types'

type Props = {
  bundle: MemoryMapBundle
  initialAreaId?: string | null
}

export default function MemoryMapViewer({ bundle, initialAreaId }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(
    initialAreaId ?? areas[0]?.id ?? null
  )
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [mapMode, setMapMode] = useState<'geo' | 'image'>(
    areas.find((a) => a.id === (initialAreaId ?? areas[0]?.id))?.map_type === 'image' ? 'image' : 'geo'
  )
  const [activePin, setActivePin] = useState<MemoryPin | null>(null)

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0]
  const visiblePins = useMemo(() => {
    return pins.filter((pin) => {
      if (pin.area_id !== selectedArea?.id) return false
      if (pin.status !== 'approved') return false
      if (categoryFilter && pin.category_id !== categoryFilter) return false
      return true
    })
  }, [pins, selectedArea?.id, categoryFilter])

  const pinStories = useMemo(() => {
    if (!activePin) return []
    return stories.filter((s) => s.pin_id === activePin.id && s.status === 'approved')
  }, [activePin, stories])

  if (!selectedArea) {
    return <p className="p-6 text-center text-sm text-white/70">No areas configured yet.</p>
  }

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} areaName={selectedArea.name} />

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <MapTypeToggle
          mode={mapMode}
          onChange={setMapMode}
          showGeo={selectedArea.map_type === 'geo'}
          showImage={selectedArea.map_type === 'image'}
        />
        {map.sponsor_name ? (
          <p className="mm-muted truncate text-[10px]">Sponsored by {map.sponsor_name}</p>
        ) : null}
      </div>

      <CategoryFilterPills categories={categories} selectedId={categoryFilter} onSelect={setCategoryFilter} />
      <MapCanvas area={selectedArea} pins={visiblePins} mode={mapMode} onPinClick={setActivePin} />

      <div className="px-4 pb-6">
        <h2 className="text-sm font-black uppercase tracking-wide text-white/80">Areas</h2>
        <AreaSelector
          areas={areas}
          selectedAreaId={selectedAreaId}
          onSelect={(id) => {
            setSelectedAreaId(id)
            const area = areas.find((a) => a.id === id)
            if (area) setMapMode(area.map_type)
          }}
        />
      </div>

      <PinPreviewSheet
        open={Boolean(activePin)}
        pin={activePin}
        stories={pinStories}
        mapSlug={map.slug}
        onClose={() => setActivePin(null)}
      />
    </div>
  )
}
