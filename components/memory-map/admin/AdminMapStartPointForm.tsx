'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateMemoryMapStartPoint } from '@/lib/memory-map/mutations'
import { FALLBACK_GEO, isValidLatLng } from '@/lib/memory-map/map-starting-point'
import type { MemoryMap } from '@/lib/memory-map/types'
import AdminGeoMapPicker, { useBrowserGeo } from '@/components/memory-map/admin/AdminGeoMapPicker'

type Props = {
  map: MemoryMap
  onSaved: (map: MemoryMap) => void
}

export default function AdminMapStartPointForm({ map, onSaved }: Props) {
  const [lat, setLat] = useState(String(map.default_lat ?? ''))
  const [lng, setLng] = useState(String(map.default_lng ?? ''))
  const [zoom, setZoom] = useState(String(map.default_zoom ?? 17))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const geo = useBrowserGeo()

  useEffect(() => {
    if (geo.coords) {
      setLat(String(geo.coords.lat))
      setLng(String(geo.coords.lng))
    }
  }, [geo.coords])

  const latNum = lat ? parseFloat(lat) : null
  const lngNum = lng ? parseFloat(lng) : null
  const zoomNum = parseInt(zoom, 10) || 17

  async function onSave() {
    setError('')
    setMessage('')
    if (!isValidLatLng(latNum, lngNum)) {
      setError('Enter valid latitude and longitude.')
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
    setMessage('Default starting point saved.')
    onSaved({
      ...map,
      default_lat: latNum,
      default_lng: lngNum,
      default_zoom: zoomNum,
    })
  }

  function onResetSchoolDefault() {
    setLat(String(FALLBACK_GEO.lat))
    setLng(String(FALLBACK_GEO.lng))
    setZoom(String(FALLBACK_GEO.zoom))
  }

  return (
    <div className="mm-card space-y-4 rounded-2xl p-4">
      <div>
        <h3 className="text-sm font-black">Default map starting point</h3>
        <p className="mm-muted mt-1 text-xs leading-relaxed">
          Set where the map should open by default. This helps visitors and contributors start in the right place instead of landing on a generic map view.
        </p>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <AdminGeoMapPicker
        lat={latNum}
        lng={lngNum}
        zoom={zoomNum}
        onChange={(newLat, newLng) => {
          setLat(String(newLat))
          setLng(String(newLng))
        }}
        onZoomChange={(z) => setZoom(String(z))}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <input value={zoom} onChange={(e) => setZoom(e.target.value)} type="number" min={1} max={22} placeholder="Zoom" className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => geo.request()} disabled={geo.loading} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold">
          {geo.loading ? 'Finding…' : 'Use current location'}
        </button>
        <button type="button" onClick={onResetSchoolDefault} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold">
          Reset to school default
        </button>
        <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save starting point'}
        </button>
      </div>
    </div>
  )
}
