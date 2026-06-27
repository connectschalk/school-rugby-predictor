'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoView } from '@/lib/memory-map/map-starting-point'
import { isValidLatLng } from '@/lib/memory-map/map-starting-point'

type Props = {
  lat: number | null
  lng: number | null
  zoom: number
  onChange: (lat: number, lng: number) => void
  onZoomChange?: (zoom: number) => void
  defaultCentre?: GeoView | null
  pickMode?: boolean
  className?: string
}

export default function AdminGeoMapPicker({
  lat,
  lng,
  zoom,
  onChange,
  onZoomChange,
  defaultCentre,
  pickMode = true,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const [ready, setReady] = useState(false)

  onChangeRef.current = onChange

  const centreLat = lat ?? defaultCentre?.lat ?? -33.9249
  const centreLng = lng ?? defaultCentre?.lng ?? 18.4241
  const initialZoom = lat != null && lng != null ? zoom : (defaultCentre?.zoom ?? zoom)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, { zoomControl: true }).setView([centreLat, centreLng], initialZoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      if (pickMode) {
        map.on('click', (e) => {
          onChangeRef.current(e.latlng.lat, e.latlng.lng)
        })
      }

      map.on('zoomend', () => {
        onZoomChange?.(map.getZoom())
      })

      mapRef.current = map
      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init when pick mode toggles
  }, [pickMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (isValidLatLng(lat, lng)) {
      map.setView([lat!, lng!], map.getZoom(), { animate: true })
      void import('leaflet').then((L) => {
        if (markerRef.current) markerRef.current.remove()
        const icon = L.divIcon({
          className: 'mm-leaflet-pin',
          html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#FFD400;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        })
        markerRef.current = L.marker([lat!, lng!], { icon }).addTo(map)
      })
    }
  }, [lat, lng, ready])

  useEffect(() => {
    if (mapRef.current && ready) {
      mapRef.current.setZoom(zoom)
    }
  }, [zoom, ready])

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="mm-leaflet-map aspect-[4/3] overflow-hidden rounded-2xl border border-white/10" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#0a1628]/90 text-xs text-white/70">
          Loading map…
        </div>
      ) : null}
      {pickMode ? (
        <p className="mm-muted mt-1 text-xs">Tap the map to set the starting point.</p>
      ) : null}
    </div>
  )
}

export function useBrowserGeo(): { request: () => void; loading: boolean; error: string | null; coords: GeoView | null } {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState<GeoView | null>(null)

  function request() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported.')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 18 })
        setLoading(false)
      },
      () => {
        setError('Could not access your location.')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  return { request, loading, error, coords }
}
