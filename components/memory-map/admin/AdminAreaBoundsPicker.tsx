'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoView } from '@/lib/memory-map/map-starting-point'
import { buildRectangleBounds, type AreaRectangleBounds } from '@/lib/memory-map/default-area'

type Props = {
  defaultCentre: GeoView
  bounds: AreaRectangleBounds | null
  onChange: (bounds: AreaRectangleBounds | null) => void
}

export default function AdminAreaBoundsPicker({ defaultCentre, bounds, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const rectRef = useRef<import('leaflet').Rectangle | null>(null)
  const onChangeRef = useRef(onChange)
  const dragStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [drawing, setDrawing] = useState(false)

  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

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

      map.on('mousedown', (e) => {
        dragStartRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        setDrawing(true)
        if (rectRef.current) {
          rectRef.current.remove()
          rectRef.current = null
        }
      })

      map.on('mousemove', (e) => {
        if (!dragStartRef.current) return
        const next = buildRectangleBounds(dragStartRef.current, { lat: e.latlng.lat, lng: e.latlng.lng })
        if (rectRef.current) rectRef.current.remove()
        rectRef.current = L.rectangle(
          [
            [next.south, next.west],
            [next.north, next.east],
          ],
          { color: '#FFD400', weight: 2, fillOpacity: 0.15 }
        ).addTo(map)
      })

      map.on('mouseup', (e) => {
        if (!dragStartRef.current) return
        const next = buildRectangleBounds(dragStartRef.current, { lat: e.latlng.lat, lng: e.latlng.lng })
        dragStartRef.current = null
        setDrawing(false)
        if (Math.abs(next.north - next.south) < 0.00005 || Math.abs(next.east - next.west) < 0.00005) {
          onChangeRef.current(null)
          return
        }
        onChangeRef.current(next)
      })

      mapRef.current = map
      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
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
