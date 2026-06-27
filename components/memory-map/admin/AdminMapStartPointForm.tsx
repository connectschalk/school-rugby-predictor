'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateMemoryMapStartPoint } from '@/lib/memory-map/mutations'
import type { GeocodeResult } from '@/lib/memory-map/geocode'
import { getMemoryMapDefaultCenter, isValidLatLng } from '@/lib/memory-map/map-starting-point'
import { useMemoryMapGeolocation } from '@/lib/memory-map/use-memory-map-geolocation'
import type { MemoryMap } from '@/lib/memory-map/types'
import AdminGeoMapPicker from '@/components/memory-map/admin/AdminGeoMapPicker'

const DEFAULT_SEARCH_ZOOM = 17
const ADMIN_GEO_UNAVAILABLE_MESSAGE =
  'Location not available. You can still search or click on the map.'

type Props = {
  map: MemoryMap
  onSaved: (map: MemoryMap) => void
}

export default function AdminMapStartPointForm({ map, onSaved }: Props) {
  const [lat, setLat] = useState(String(map.default_lat ?? ''))
  const [lng, setLng] = useState(String(map.default_lng ?? ''))
  const [zoom, setZoom] = useState(String(map.default_zoom ?? DEFAULT_SEARCH_ZOOM))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const geo = useMemoryMapGeolocation()
  const mapPickerRef = useRef<HTMLDivElement>(null)

  const latNum = lat ? parseFloat(lat) : null
  const lngNum = lng ? parseFloat(lng) : null
  const zoomNum = parseInt(zoom, 10) || DEFAULT_SEARCH_ZOOM
  const mapDefaultCentre = getMemoryMapDefaultCenter(map)

  function applyCoordinates(newLat: number, newLng: number, newZoom = DEFAULT_SEARCH_ZOOM) {
    setLat(String(newLat))
    setLng(String(newLng))
    setZoom(String(newZoom))
    setLocateTarget({ lat: newLat, lng: newLng, zoom: newZoom })
  }

  useEffect(() => {
    if (geo.status === 'success' && geo.location) {
      setLat(String(geo.location.lat))
      setLng(String(geo.location.lng))
      setZoom('18')
      setLocateTarget({ lat: geo.location.lat, lng: geo.location.lng, zoom: 18 })
    }
  }, [geo.status, geo.location])

  async function onSearch(event?: React.FormEvent) {
    event?.preventDefault()
    const q = searchQuery.trim()
    if (q.length < 3) {
      setSearchError('Enter at least 3 characters to search.')
      setSearchResults([])
      return
    }

    setSearching(true)
    setSearchError('')
    setSearchResults([])
    setSelectedResultId(null)

    try {
      const res = await fetch(`/api/memory-map/geocode?q=${encodeURIComponent(q)}`)
      const data = (await res.json()) as { ok?: boolean; results?: GeocodeResult[]; error?: string }
      if (!res.ok || !data.ok) {
        setSearchError(data.error ?? 'Search failed. Try again.')
        return
      }
      const results = data.results ?? []
      setSearchResults(results)
      if (results.length === 0) {
        setSearchError('No places found. Try a different search or click on the map.')
      }
    } catch {
      setSearchError('Search failed. Try again.')
    } finally {
      setSearching(false)
    }
  }

  function onSelectResult(result: GeocodeResult) {
    setSelectedResultId(result.id)
    applyCoordinates(result.lat, result.lng, DEFAULT_SEARCH_ZOOM)
    setSearchError('')
    mapPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function onSave() {
    setError('')
    setMessage('')
    if (!isValidLatLng(latNum, lngNum)) {
      setError('Search for a place, use your location, or click on the map to set a starting point.')
      return
    }
    setSaving(true)
    const { error: err } = await updateMemoryMapStartPoint(supabase, map.id, {
      default_lat: latNum,
      default_lng: lngNum,
      default_zoom: zoomNum,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setMessage('Default opening point saved.')
    onSaved({
      ...map,
      default_lat: latNum,
      default_lng: lngNum,
      default_zoom: zoomNum,
    })
  }

  const geoMessage =
    geo.status === 'denied' || geo.status === 'error'
      ? ADMIN_GEO_UNAVAILABLE_MESSAGE
      : null

  return (
    <div className="mm-card space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-base font-black">Default map opening point</h2>
        <p className="mm-muted mt-2 text-sm leading-relaxed">
          This is where the Memory Map opens by default. Search for the school, event venue or place, use your current
          location, or click on the map.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <form onSubmit={(e) => void onSearch(e)} className="space-y-2">
        <label className="block">
          <span className="mm-muted mb-1 block text-xs font-semibold">Search for an address or place</span>
          <div className="flex flex-wrap gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search school, venue, address…"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={searching}
              className="mm-btn-secondary shrink-0 rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </label>
      </form>

      {searchError ? <p className="text-sm text-amber-200">{searchError}</p> : null}

      {searchResults.length > 0 ? (
        <ul className="space-y-2">
          {searchResults.map((result) => {
            const selected = selectedResultId === result.id
            return (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onSelectResult(result)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selected ? 'mm-border-accent mm-bg-accent-10' : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                  }`}
                >
                  <p className="text-sm font-bold leading-snug">{result.name}</p>
                  <p className="mm-muted mt-0.5 text-xs leading-relaxed">{result.displayName}</p>
                  <p className="mm-muted mt-1 text-[10px]">
                    {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => geo.locate()}
          disabled={geo.status === 'loading'}
          className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          {geo.status === 'loading' ? 'Finding location…' : 'Use my current location'}
        </button>
      </div>
      {geoMessage ? <p className="text-sm text-amber-200">{geoMessage}</p> : null}

      <div ref={mapPickerRef}>
        <AdminGeoMapPicker
          lat={latNum}
          lng={lngNum}
          zoom={zoomNum}
          defaultCentre={mapDefaultCentre}
          locateTarget={locateTarget}
          onChange={(newLat, newLng) => {
            setLat(String(newLat))
            setLng(String(newLng))
            setSelectedResultId(null)
          }}
          onZoomChange={(z) => setZoom(String(z))}
        />
      </div>

      <details className="rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-white/90">Advanced coordinates</summary>
        <div className="grid gap-3 border-t border-white/10 p-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mm-muted mb-1 block text-xs font-semibold">Default latitude</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-33.9249"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mm-muted mb-1 block text-xs font-semibold">Default longitude</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="18.4241"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mm-muted mb-1 block text-xs font-semibold">Default zoom</span>
            <input
              value={zoom}
              onChange={(e) => setZoom(e.target.value)}
              type="number"
              min={1}
              max={22}
              placeholder="17"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save default starting point'}
        </button>
      </div>

      <p className="mm-muted border-t border-white/10 pt-3 text-xs leading-relaxed">
        Area starting points override this default. If an area has no starting point, this Memory Map default is used.
      </p>
    </div>
  )
}
