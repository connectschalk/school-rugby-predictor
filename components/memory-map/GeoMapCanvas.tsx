'use client'

import { useEffect, useRef, useState } from 'react'
import type { MemoryArea, MemoryPin, MapPlacement } from '@/lib/memory-map/types'
import type { GeoView } from '@/lib/memory-map/map-starting-point'
import MockGeoMapCanvas from '@/components/memory-map/MockGeoMapCanvas'

type Props = {
  area: MemoryArea
  pins: MemoryPin[]
  onPinClick: (pin: MemoryPin) => void
  placementMode?: boolean
  placementPreview?: MapPlacement | null
  onMapClick?: (placement: MapPlacement) => void
  showPlacementDebug?: boolean
  locateTarget?: { lat: number; lng: number } | null
  initialView?: GeoView | null
}

function pinIconHtml(colour: string, label: string): string {
  return `<span style="display:flex;align-items:center;justify-content:center;min-width:36px;min-height:36px;padding:0 6px;border-radius:9999px;border:2px solid rgba(255,255,255,0.85);background:${colour};color:#050505;font-size:11px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,0.35)">${label}</span>`
}

export default function GeoMapCanvas({
  area,
  pins,
  onPinClick,
  placementMode = false,
  placementPreview,
  onMapClick,
  showPlacementDebug = false,
  locateTarget,
  initialView,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markersLayerRef = useRef<import('leaflet').LayerGroup | null>(null)
  const previewMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const [useFallback, setUseFallback] = useState(false)
  const [ready, setReady] = useState(false)

  onMapClickRef.current = onMapClick

  const centreLat = initialView?.lat ?? area.centre_lat ?? -33.925
  const centreLng = initialView?.lng ?? area.centre_lng ?? 18.425
  const centreZoom = initialView?.zoom ?? area.default_zoom ?? 16

  useEffect(() => {
    if (useFallback || !containerRef.current) return
    let cancelled = false
    let map: import('leaflet').Map | null = null

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return

      try {
        map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([centreLat, centreLng], centreZoom)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        markersLayerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map

        if (placementMode) {
          map.on('click', (e) => {
            onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
          })
        }

        setReady(true)
        setTimeout(() => map?.invalidateSize(), 100)
      } catch {
        setUseFallback(true)
      }
    }).catch(() => setUseFallback(true))

    return () => {
      cancelled = true
      previewMarkerRef.current = null
      markersLayerRef.current = null
      map?.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [area.id, centreLat, centreLng, centreZoom, useFallback, placementMode])

  useEffect(() => {
    if (!mapRef.current || !ready || !initialView) return
    mapRef.current.setView([initialView.lat, initialView.lng], initialView.zoom, { animate: false })
  }, [initialView?.lat, initialView?.lng, initialView?.zoom, ready])

  useEffect(() => {
    const map = mapRef.current
    const layer = markersLayerRef.current
    if (!map || !layer || !ready) return

    void import('leaflet').then((L) => {
      layer.clearLayers()
      for (const pin of pins) {
        if (pin.lat == null || pin.lng == null) continue
        const colour = pin.colour ?? pin.category?.colour ?? '#FFD400'
        const count = pin.story_count ?? 0
        const icon = L.divIcon({
          className: 'mm-leaflet-pin',
          html: pinIconHtml(colour, count > 1 ? String(count) : '●'),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })
        const marker = L.marker([pin.lat, pin.lng], { icon })
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          onPinClick(pin)
        })
        marker.addTo(layer)
      }
    })
  }, [pins, onPinClick, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    void import('leaflet').then((L) => {
      if (previewMarkerRef.current) {
        previewMarkerRef.current.remove()
        previewMarkerRef.current = null
      }
      if (placementPreview?.lat != null && placementPreview?.lng != null) {
        const icon = L.divIcon({
          className: 'mm-leaflet-pin',
          html: pinIconHtml('#FFD400', '+'),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
        previewMarkerRef.current = L.marker([placementPreview.lat, placementPreview.lng], { icon }).addTo(map)
      }
    })
  }, [placementPreview, ready])

  useEffect(() => {
    if (!locateTarget || !mapRef.current) return
    mapRef.current.setView([locateTarget.lat, locateTarget.lng], 17, { animate: true })
  }, [locateTarget])

  if (useFallback) {
    return (
      <MockGeoMapCanvas
        area={area}
        pins={pins}
        onPinClick={onPinClick}
        placementMode={placementMode}
        placementPreview={placementPreview}
        onMapClick={onMapClick}
        showPlacementDebug={showPlacementDebug}
        fallbackLabel="Map unavailable — preview mode"
        initialView={initialView}
      />
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`mm-leaflet-map aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 ${
          placementMode ? 'ring-2 ring-[var(--mm-accent)]' : ''
        }`}
      />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#0a1628]/90 text-xs text-white/70">
          Loading map…
        </div>
      ) : null}
      {showPlacementDebug && placementPreview?.lat != null ? (
        <p className="mm-muted mt-1 text-center text-[10px]">
          {placementPreview.lat.toFixed(5)}, {placementPreview.lng?.toFixed(5)}
        </p>
      ) : null}
    </div>
  )
}
