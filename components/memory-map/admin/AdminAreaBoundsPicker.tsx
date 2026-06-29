'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoView } from '@/lib/memory-map/map-starting-point'
import { buildRectangleBounds, type AreaRectangleBounds } from '@/lib/memory-map/default-area'

type Props = {
  defaultCentre: GeoView
  bounds: AreaRectangleBounds | null
  onChange: (bounds: AreaRectangleBounds | null) => void
}

type LeafletMap = import('leaflet').Map
type LeafletRectangle = import('leaflet').Rectangle

/** Stop map pan/zoom while the user is dragging out a rectangle. */
function setMapDrawInteraction(map: LeafletMap, locked: boolean) {
  const tap = (map as LeafletMap & { tap?: { disable: () => void; enable: () => void } }).tap
  if (locked) {
    map.dragging.disable()
    map.touchZoom.disable()
    map.doubleClickZoom.disable()
    map.boxZoom.disable()
    tap?.disable()
  } else {
    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.boxZoom.enable()
    tap?.enable()
  }
}

function latLngFromPointerEvent(map: LeafletMap, event: PointerEvent) {
  return map.mouseEventToLatLng(event as unknown as MouseEvent)
}

export default function AdminAreaBoundsPicker({ defaultCentre, bounds, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const rectRef = useRef<LeafletRectangle | null>(null)
  const onChangeRef = useRef(onChange)
  const dragStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [drawing, setDrawing] = useState(false)

  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let cleanupListeners: (() => void) | null = null

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { zoomControl: true }).setView(
        [defaultCentre.lat, defaultCentre.lng],
        defaultCentre.zoom
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const container = map.getContainer()

      function updatePreview(end: { lat: number; lng: number }) {
        if (!dragStartRef.current) return
        const next = buildRectangleBounds(dragStartRef.current, end)
        if (rectRef.current) rectRef.current.remove()
        rectRef.current = L.rectangle(
          [
            [next.south, next.west],
            [next.north, next.east],
          ],
          { color: '#FFD400', weight: 2, fillOpacity: 0.15 }
        ).addTo(map)
      }

      function finishDraw(end: { lat: number; lng: number }) {
        if (!dragStartRef.current) return
        const start = dragStartRef.current
        dragStartRef.current = null
        setDrawing(false)
        setMapDrawInteraction(map, false)

        const next = buildRectangleBounds(start, end)
        if (Math.abs(next.north - next.south) < 0.00005 || Math.abs(next.east - next.west) < 0.00005) {
          onChangeRef.current(null)
          return
        }
        onChangeRef.current(next)
      }

      function cancelDraw() {
        if (!dragStartRef.current) return
        dragStartRef.current = null
        setDrawing(false)
        setMapDrawInteraction(map, false)
      }

      function onPointerDown(event: PointerEvent) {
        if (event.pointerType === 'mouse' && event.button !== 0) return

        setMapDrawInteraction(map, true)
        const point = latLngFromPointerEvent(map, event)
        dragStartRef.current = { lat: point.lat, lng: point.lng }
        setDrawing(true)

        if (rectRef.current) {
          rectRef.current.remove()
          rectRef.current = null
        }

        try {
          container.setPointerCapture(event.pointerId)
        } catch {
          // Pointer capture unsupported — document listeners still handle release.
        }
      }

      function onPointerMove(event: PointerEvent) {
        if (!dragStartRef.current) return
        event.preventDefault()
        const point = latLngFromPointerEvent(map, event)
        updatePreview({ lat: point.lat, lng: point.lng })
      }

      function onPointerUp(event: PointerEvent) {
        if (!dragStartRef.current) return
        event.preventDefault()
        try {
          container.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
        const point = latLngFromPointerEvent(map, event)
        finishDraw({ lat: point.lat, lng: point.lng })
      }

      function onPointerCancel(event: PointerEvent) {
        if (!dragStartRef.current) return
        try {
          container.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
        cancelDraw()
      }

      /** Block touch scrolling/panning while a rectangle drag is in progress. */
      function onTouchMove(event: TouchEvent) {
        if (!dragStartRef.current) return
        event.preventDefault()
      }

      container.addEventListener('pointerdown', onPointerDown)
      container.addEventListener('pointermove', onPointerMove)
      container.addEventListener('pointerup', onPointerUp)
      container.addEventListener('pointercancel', onPointerCancel)
      container.addEventListener('touchmove', onTouchMove, { passive: false })

      cleanupListeners = () => {
        container.removeEventListener('pointerdown', onPointerDown)
        container.removeEventListener('pointermove', onPointerMove)
        container.removeEventListener('pointerup', onPointerUp)
        container.removeEventListener('pointercancel', onPointerCancel)
        container.removeEventListener('touchmove', onTouchMove)
        setMapDrawInteraction(map, false)
      }

      mapRef.current = map
      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      cleanupListeners?.()
      rectRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [defaultCentre.lat, defaultCentre.lng, defaultCentre.zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !bounds) return
    void import('leaflet').then((L) => {
      if (rectRef.current) rectRef.current.remove()
      rectRef.current = L.rectangle(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { color: '#FFD400', weight: 2, fillOpacity: 0.15 }
      ).addTo(map)
      map.fitBounds(rectRef.current.getBounds(), { padding: [24, 24] })
    })
  }, [bounds, ready])

  return (
    <div className="relative">
      <div ref={containerRef} className="mm-leaflet-map aspect-[4/3] overflow-hidden rounded-2xl border border-white/10" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#0a1628]/90 text-xs text-white/70">
          Loading map…
        </div>
      ) : null}
      <p className="mm-muted mt-1 text-xs">
        {drawing ? 'Release to finish the area.' : 'Click and drag on the map to draw a rectangle.'}
      </p>
    </div>
  )
}
