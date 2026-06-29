'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { trackMemoryMapEvent } from '@/lib/memory-map/analytics'
import { fetchPublicMemoryMapBundleClient } from '@/lib/memory-map/client-queries'
import { ensureDefaultMemoryArea } from '@/lib/memory-map/mutations'
import { shouldShowAreaSelector } from '@/lib/memory-map/default-area'
import { useMemoryMapGeolocation } from '@/lib/memory-map/use-memory-map-geolocation'
import type { MemoryMapBundle, MemoryPin } from '@/lib/memory-map/types'
import { memoryMapThemeVars, mmSelectedAreaStyle, resolvePublicMemoryMapTheme } from '@/lib/memory-map/theme'
import { areaMapTypeLabel, matchesYearFilter, type YearFilterKey } from '@/lib/memory-map/utils'
import { getImageMapInitialFocus, getMapInitialView } from '@/lib/memory-map/map-starting-point'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import CategoryFilterPills from '@/components/memory-map/CategoryFilterPills'
import YearFilterPills from '@/components/memory-map/YearFilterPills'
import MapTypeToggle from '@/components/memory-map/MapTypeToggle'
import type { GeoBaseLayer } from '@/lib/memory-map/geo-tile-layers'
import MapCanvas from '@/components/memory-map/MapCanvas'
import GeoBaseLayerToggle from '@/components/memory-map/GeoBaseLayerToggle'
import PinPreviewSheet from '@/components/memory-map/PinPreviewSheet'
import MemoryMapShell from '@/components/memory-map/MemoryMapShell'
import MapOnboardingOverlay from '@/components/memory-map/MapOnboardingOverlay'
import MemoryMapSponsorStrip from '@/components/memory-map/MemoryMapSponsorStrip'

type Props = {
  bundle: MemoryMapBundle
  initialAreaId?: string | null
  initialPinId?: string | null
}

export default function MemoryMapViewer({ bundle, initialAreaId, initialPinId }: Props) {
  const [resolvedBundle, setResolvedBundle] = useState(bundle)
  const [ensuringAreas, setEnsuringAreas] = useState(false)
  const { map, areas, categories, pins, stories } = resolvedBundle
  const theme = useMemo(() => resolvePublicMemoryMapTheme(map), [map])
  const activeAreas = areas.filter((a) => a.is_active)
  const showAreaSelector = shouldShowAreaSelector(areas)
  const defaultAreaId =
    initialAreaId && activeAreas.some((a) => a.id === initialAreaId)
      ? initialAreaId
      : activeAreas[0]?.id ?? null

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(defaultAreaId)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<YearFilterKey>('all')
  const [customYear, setCustomYear] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [mapMode, setMapMode] = useState<'geo' | 'image'>(
    activeAreas.find((a) => a.id === defaultAreaId)?.map_type === 'image' ? 'image' : 'geo'
  )
  const [geoBaseLayer, setGeoBaseLayer] = useState<GeoBaseLayer>('map')
  const [activePin, setActivePin] = useState<MemoryPin | null>(null)
  const geo = useMemoryMapGeolocation()
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)

  useEffect(() => {
    void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'map_opened' })
  }, [map.id])

  useEffect(() => {
    if (activeAreas.length > 0) return
    setEnsuringAreas(true)
    void ensureDefaultMemoryArea(supabase, map.id)
      .then(({ error }) => {
        if (error) return
        return fetchPublicMemoryMapBundleClient(supabase, map.slug)
      })
      .then((live) => {
        if (live) setResolvedBundle(live)
      })
      .finally(() => setEnsuringAreas(false))
  }, [activeAreas.length, map.id, map.slug])

  useEffect(() => {
    if (!initialPinId) return
    const pin = pins.find((p) => p.id === initialPinId && p.status === 'approved')
    if (pin) {
      setSelectedAreaId(pin.area_id)
      setActivePin(pin)
    }
  }, [initialPinId, pins])

  const selectedArea = activeAreas.find((a) => a.id === selectedAreaId) ?? activeAreas[0]
  const hasAreas = activeAreas.length > 0

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

  const geoInitialView = useMemo(() => {
    if (!selectedArea) return null
    return getMapInitialView({ area: selectedArea, memoryMap: map, pins })
  }, [selectedArea, map, pins])

  const imageFocus = useMemo(() => {
    if (!selectedArea) return null
    return getImageMapInitialFocus(selectedArea)
  }, [selectedArea])

  const filteredEmpty = Boolean(searchQuery || categoryFilter || yearFilter !== 'all')

  function selectArea(areaId: string) {
    const area = activeAreas.find((a) => a.id === areaId)
    setSelectedAreaId(areaId)
    if (area) setMapMode(area.map_type === 'image' ? 'image' : 'geo')
    setActivePin(null)
    geo.clear()
    setLocateTarget(null)
    void trackMemoryMapEvent(supabase, {
      memoryMapId: map.id,
      eventType: 'area_selected',
      areaId,
    })
  }

  useEffect(() => {
    if (geo.status === 'success' && geo.location) {
      setLocateTarget({ lat: geo.location.lat, lng: geo.location.lng, zoom: 18 })
    }
  }, [geo.status, geo.location])

  return (
    <div className="mm-root" style={memoryMapThemeVars(map)}>
      <MemoryMapHeader
        map={map}
        mapSlug={map.slug}
        areaName={selectedArea?.name}
        rightSlot={
          <Link
            href={`/memory-map/${map.slug}/add${selectedAreaId ? `?area=${selectedAreaId}` : ''}`}
            className="mm-btn-primary rounded-full px-2.5 py-1 text-[10px] font-black"
          >
            Add a Memory
          </Link>
        }
      />

      {map.sponsor_name ? <MemoryMapSponsorStrip map={map} variant="banner" /> : null}

      <div className="px-4 py-3">
        <h2 className="text-lg font-black">Discover memories</h2>
        <p className="mm-muted mt-1 text-sm">Choose an area, then tap a pin to view stories.</p>
      </div>

      {!hasAreas ? (
        <div className="px-2 pb-4">
          <MemoryMapShell map={map} message={ensuringAreas ? 'Preparing the map…' : 'No areas have been published yet.'} />
        </div>
      ) : (
        <>
          {showAreaSelector ? (
          <div className="mb-3 flex gap-2 mm-hide-scrollbar">
            {activeAreas.map((area) => {
              const count = pins.filter((p) => p.area_id === area.id && p.status === 'approved').length
              const selected = selectedAreaId === area.id
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => selectArea(area.id)}
                  className={`min-h-[44px] shrink-0 rounded-2xl border px-4 py-2.5 text-left text-sm ${
                    selected ? 'mm-bg-accent-10' : 'border-white/10 bg-white/5'
                  }`}
                  style={selected ? mmSelectedAreaStyle(theme) : undefined}
                >
                  <p className="font-bold leading-tight">{area.name}</p>
                  <p className="mm-muted mt-0.5 text-[11px]">{areaMapTypeLabel(area)} · {count} pins</p>
                </button>
              )
            })}
          </div>
          ) : null}

          {selectedArea ? (
            <>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                <MapTypeToggle
                  mode={mapMode}
                  onChange={setMapMode}
                  showGeo={selectedArea.map_type === 'geo'}
                  showImage={selectedArea.map_type === 'image'}
                />
                {mapMode === 'geo' ? (
                  <GeoBaseLayerToggle layer={geoBaseLayer} onChange={setGeoBaseLayer} />
                ) : null}
                <div className="ml-auto flex gap-1.5">
                  {mapMode === 'geo' ? (
                    <button
                      type="button"
                      onClick={() => geo.locate()}
                      disabled={geo.status === 'loading'}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        geo.status === 'success' ? 'mm-btn-primary' : 'mm-btn-secondary'
                      }`}
                    >
                      {geo.status === 'loading' ? 'Finding location…' : 'Show my location'}
                    </button>
                  ) : null}
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

              {geo.message ? <p className="mm-muted px-4 pb-2 text-xs">{geo.message}</p> : null}

              {showFilters ? (
                <div className="space-y-2 px-4 pb-2">
                  <CategoryFilterPills categories={categories.filter((c) => c.is_active)} selectedId={categoryFilter} onSelect={setCategoryFilter} />
                  <YearFilterPills
                    value={yearFilter}
                    customYear={customYear}
                    onChange={setYearFilter}
                    onCustomYear={setCustomYear}
                  />
                </div>
              ) : null}

              {visiblePins.length === 0 && !filteredEmpty ? (
                <p className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80">
                  No memories have been added here yet.{' '}
                  <Link href={`/memory-map/${map.slug}/add?area=${selectedArea.id}`} className="font-bold mm-text-accent">
                    Add a Memory
                  </Link>
                </p>
              ) : null}

              {visiblePins.length === 0 && filteredEmpty ? (
                <p className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80">
                  No stories match your filters. Try clearing search or filters.
                </p>
              ) : null}

              <MapCanvas
                area={selectedArea}
                pins={visiblePins}
                mode={mapMode}
                baseLayer={geoBaseLayer}
                locateTarget={locateTarget}
                userLocation={geo.status === 'success' ? geo.location : null}
                initialView={geoInitialView}
                imageFocus={imageFocus}
                onPinClick={(pin) => {
                  setActivePin(pin)
                  void trackMemoryMapEvent(supabase, {
                    memoryMapId: map.id,
                    eventType: 'pin_opened',
                    areaId: selectedArea.id,
                    pinId: pin.id,
                  })
                }}
              />
            </>
          ) : null}
        </>
      )}

      <PinPreviewSheet
        open={Boolean(activePin)}
        pin={activePin}
        stories={pinStories}
        mapSlug={map.slug}
        map={map}
        areaName={selectedArea?.name ?? ''}
        onClose={() => setActivePin(null)}
      />

      <MapOnboardingOverlay mapSlug={map.slug} map={map} />
    </div>
  )
}
