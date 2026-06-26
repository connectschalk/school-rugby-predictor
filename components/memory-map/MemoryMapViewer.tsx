'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { trackMemoryMapEvent } from '@/lib/memory-map/analytics'
import type { MemoryMapBundle, MemoryPin } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import { matchesYearFilter, type YearFilterKey } from '@/lib/memory-map/utils'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import AreaSelector from '@/components/memory-map/AreaSelector'
import CategoryFilterPills from '@/components/memory-map/CategoryFilterPills'
import YearFilterPills from '@/components/memory-map/YearFilterPills'
import MapTypeToggle from '@/components/memory-map/MapTypeToggle'
import MapCanvas from '@/components/memory-map/MapCanvas'
import PinPreviewSheet from '@/components/memory-map/PinPreviewSheet'
import MmEmptyState from '@/components/memory-map/MmEmptyState'
import MapOnboardingOverlay from '@/components/memory-map/MapOnboardingOverlay'
import MemoryMapSponsorStrip from '@/components/memory-map/MemoryMapSponsorStrip'

type Props = {
  bundle: MemoryMapBundle
  initialAreaId?: string | null
}

type Screen = 'areas' | 'map'

export default function MemoryMapViewer({ bundle, initialAreaId }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const activeAreas = areas.filter((a) => a.is_active)
  const defaultAreaId = initialAreaId ?? activeAreas[0]?.id ?? null

  const [screen, setScreen] = useState<Screen>(activeAreas.length === 1 ? 'map' : 'areas')
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(defaultAreaId)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<YearFilterKey>('all')
  const [customYear, setCustomYear] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [mapMode, setMapMode] = useState<'geo' | 'image'>(
    activeAreas.find((a) => a.id === defaultAreaId)?.map_type === 'image' ? 'image' : 'geo'
  )
  const [activePin, setActivePin] = useState<MemoryPin | null>(null)
  const [locateMessage, setLocateMessage] = useState<string | null>(null)
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'map_opened' })
  }, [map.id])

  const selectedArea = activeAreas.find((a) => a.id === selectedAreaId) ?? activeAreas[0]

  const visiblePins = useMemo(() => {
    const customY = customYear ? parseInt(customYear, 10) : undefined
    const q = searchQuery.trim().toLowerCase()
    return pins.filter((pin) => {
      if (pin.area_id !== selectedArea?.id) return false
      if (pin.status !== 'approved') return false
      if (categoryFilter && pin.category_id !== categoryFilter) return false
      if (q && !pin.title.toLowerCase().includes(q)) return false

      const pinStories = stories.filter((s) => s.pin_id === pin.id && s.status === 'approved')
      if (pinStories.length === 0 && yearFilter !== 'all') return false
      if (yearFilter !== 'all' && !pinStories.some((s) => matchesYearFilter(s, yearFilter, customY))) {
        return false
      }
      return true
    })
  }, [pins, selectedArea?.id, categoryFilter, searchQuery, stories, yearFilter, customYear])

  const pinStories = useMemo(() => {
    if (!activePin) return []
    return stories.filter((s) => s.pin_id === activePin.id && s.status === 'approved')
  }, [activePin, stories])

  function openArea(areaId: string) {
    const area = activeAreas.find((a) => a.id === areaId)
    setSelectedAreaId(areaId)
    if (area) setMapMode(area.map_type === 'image' ? 'image' : 'geo')
    setScreen('map')
    setActivePin(null)
    void trackMemoryMapEvent(supabase, {
      memoryMapId: map.id,
      eventType: 'area_selected',
      areaId,
    })
  }

  function onLocateMe() {
    if (!navigator.geolocation) {
      setLocateMessage('Location is not supported in this browser.')
      return
    }
    setLocateMessage('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocateTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocateMessage('Location found. Map centred on your position.')
      },
      () => setLocateMessage('Location permission denied. You can still browse the map manually.'),
      { timeout: 8000 }
    )
  }

  if (activeAreas.length === 0) {
    return (
      <div style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} />
        <MmEmptyState
          title="No areas have been published yet"
          description="Check back soon — school admins are setting up the Memory Map."
          icon="🗺️"
        />
      </div>
    )
  }

  if (screen === 'areas') {
    return (
      <div style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} />
        <div className="px-4 py-4">
          <h2 className="text-lg font-black">Choose an area</h2>
          <p className="mm-muted mt-1 text-sm">Each area can use a geo map or school floor plan.</p>
        </div>
        <AreaSelector
          areas={activeAreas}
          pins={pins}
          stories={stories}
          map={map}
          selectedAreaId={selectedAreaId}
          onSelect={openArea}
        />
      </div>
    )
  }

  if (!selectedArea) {
    return (
      <div style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} />
        <MmEmptyState title="Could not load map" description="Try choosing another area." icon="⚠️" />
      </div>
    )
  }

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader
        map={map}
        mapSlug={map.slug}
        areaName={selectedArea.name}
        rightSlot={
          <button
            type="button"
            onClick={() => setScreen('areas')}
            className="mm-btn-secondary shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
          >
            Areas
          </button>
        }
      />

      {map.sponsor_name ? <MemoryMapSponsorStrip map={map} variant="banner" /> : null}

      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <MapTypeToggle
          mode={mapMode}
          onChange={setMapMode}
          showGeo={selectedArea.map_type === 'geo'}
          showImage={selectedArea.map_type === 'image'}
        />
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={onLocateMe} className="mm-btn-secondary rounded-full px-2.5 py-1 text-[10px] font-bold" title="Locate me">
            📍
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${showFilters ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
          >
            Filter
          </button>
        </div>
      </div>

      <div className="px-4 pb-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search pins…"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      </div>

      {locateMessage ? <p className="mm-muted px-4 pb-2 text-xs">{locateMessage}</p> : null}

      {showFilters ? (
        <>
          <CategoryFilterPills categories={categories.filter((c) => c.is_active)} selectedId={categoryFilter} onSelect={setCategoryFilter} />
          <YearFilterPills
            value={yearFilter}
            customYear={customYear}
            onChange={setYearFilter}
            onCustomYear={setCustomYear}
          />
        </>
      ) : null}

      {visiblePins.length === 0 ? (
        <MmEmptyState
          title={searchQuery || categoryFilter || yearFilter !== 'all' ? 'No stories match your filters' : 'No pins in this area yet'}
          description={
            searchQuery || categoryFilter || yearFilter !== 'all'
              ? 'Try clearing filters or search.'
              : 'Approved memories will appear here once published.'
          }
          icon="📍"
        />
      ) : (
        <MapCanvas
          area={selectedArea}
          pins={visiblePins}
          mode={mapMode}
          locateTarget={locateTarget}
          onPinClick={(pin) => {
            setActivePin(pin)
            void trackMemoryMapEvent(supabase, {
              memoryMapId: map.id,
              eventType: 'pin_opened',
              areaId: selectedArea?.id,
              pinId: pin.id,
            })
          }}
        />
      )}

      <PinPreviewSheet
        open={Boolean(activePin)}
        pin={activePin}
        stories={pinStories}
        mapSlug={map.slug}
        map={map}
        areaName={selectedArea.name}
        onClose={() => setActivePin(null)}
      />

      <MapOnboardingOverlay mapSlug={map.slug} />
    </div>
  )
}
