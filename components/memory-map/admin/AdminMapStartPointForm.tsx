'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateMemoryMapStartPoint } from '@/lib/memory-map/mutations'
import { getMemoryMapDefaultCenter, isValidLatLng } from '@/lib/memory-map/map-starting-point'
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
  const [pickHint, setPickHint] = useState(false)
  const geo = useBrowserGeo()
  const mapPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (geo.coords) {
      setLat(String(geo.coords.lat))
      setLng(String(geo.coords.lng))
      if (geo.coords.zoom) setZoom(String(geo.coords.zoom))
    }
  }, [geo.coords])

  const latNum = lat ? parseFloat(lat) : null
  const lngNum = lng ? parseFloat(lng) : null
  const zoomNum = parseInt(zoom, 10) || 17
  const mapDefaultCentre = getMemoryMapDefaultCenter(map)

  async function onSave() {
    setError('')
    setMessage('')
    if (!isValidLatLng(latNum, lngNum)) {
      setError('Enter valid latitude and longitude, or pick a point on the map.')
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

  function onPickOnMap() {
    setPickHint(true)
    mapPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mm-card space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-base font-black">Default map opening point</h2>
        <p className="mm-muted mt-2 text-sm leading-relaxed">
          This is where the Memory Map opens by default before an area-specific starting point is used. Set this to the centre of the school, event venue or main campus.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}
      {geo.error ? <p className="text-sm text-amber-200">{geo.error}</p> : null}

      <div ref={mapPickerRef}>
        <AdminGeoMapPicker
          lat={latNum}
          lng={lngNum}
          zoom={zoomNum}
          defaultCentre={mapDefaultCentre}
          onChange={(newLat, newLng) => {
            setLat(String(newLat))
            setLng(String(newLng))
            setPickHint(false)
          }}
          onZoomChange={(z) => setZoom(String(z))}
        />
        {pickHint ? (
          <p className="mt-2 text-sm font-semibold text-[var(--mm-accent)]">Tap the map to set the default opening point.</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mm-muted mb-1 block text-xs font-semibold">Default latitude</span>
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-33.9249" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mm-muted mb-1 block text-xs font-semibold">Default longitude</span>
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="18.4241" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mm-muted mb-1 block text-xs font-semibold">Default zoom</span>
          <input value={zoom} onChange={(e) => setZoom(e.target.value)} type="number" min={1} max={22} placeholder="17" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPickOnMap} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold">
          Pick on map
        </button>
        <button type="button" onClick={() => geo.request()} disabled={geo.loading} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold">
          {geo.loading ? 'Finding…' : 'Use my current location'}
        </button>
        <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save default starting point'}
        </button>
      </div>

      <p className="mm-muted border-t border-white/10 pt-3 text-xs leading-relaxed">
        Area starting points override this default. If an area has no starting point, this Memory Map default is used.
      </p>
    </div>
  )
}
