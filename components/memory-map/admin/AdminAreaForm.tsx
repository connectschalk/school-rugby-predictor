'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { archiveMemoryArea, upsertMemoryArea } from '@/lib/memory-map/mutations'
import { MM_BUCKET_BACKGROUNDS, MM_MAX_BACKGROUND_BYTES, uploadMemoryMapImage } from '@/lib/memory-map/storage'
import type { MemoryArea } from '@/lib/memory-map/types'

type Props = {
  mapId: string
  area?: MemoryArea | null
  onSaved: () => void
  onCancel: () => void
}

export default function AdminAreaForm({ mapId, area, onSaved, onCancel }: Props) {
  const [name, setName] = useState(area?.name ?? '')
  const [description, setDescription] = useState(area?.description ?? '')
  const [areaGroup, setAreaGroup] = useState(area?.area_group ?? 'outdoor')
  const [mapType, setMapType] = useState<'geo' | 'image'>(area?.map_type ?? 'geo')
  const [centreLat, setCentreLat] = useState(String(area?.centre_lat ?? ''))
  const [centreLng, setCentreLng] = useState(String(area?.centre_lng ?? ''))
  const [geofence, setGeofence] = useState(area?.geofence_polygon ? JSON.stringify(area.geofence_polygon) : '')
  const [mapImageUrl, setMapImageUrl] = useState(area?.map_image_url ?? '')
  const [sortOrder, setSortOrder] = useState(String(area?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(area?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onMapImage(file: File | null) {
    if (!file) return
    const up = await uploadMemoryMapImage(supabase, MM_BUCKET_BACKGROUNDS, mapId, `area-${Date.now()}`, file, MM_MAX_BACKGROUND_BYTES)
    if ('error' in up) {
      setError(up.error)
      return
    }
    setMapImageUrl(up.url)
    const img = new Image()
    img.onload = () => {
      /* dimensions stored on save via optional fields if needed */
    }
    img.src = up.url
  }

  async function onSave() {
    setSaving(true)
    setError('')
    let geofenceJson = null
    if (geofence.trim()) {
      try {
        geofenceJson = JSON.parse(geofence)
      } catch {
        setError('Geofence must be valid JSON.')
        setSaving(false)
        return
      }
    }

    const { error: err } = await upsertMemoryArea(supabase, {
      mapId,
      areaId: area?.id ?? null,
      name: name.trim(),
      description: description.trim(),
      areaGroup,
      mapType,
      centreLat: centreLat ? parseFloat(centreLat) : null,
      centreLng: centreLng ? parseFloat(centreLng) : null,
      geofencePolygon: geofenceJson,
      mapImageUrl: mapImageUrl || undefined,
      sortOrder: parseInt(sortOrder, 10) || 0,
      isActive,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    onSaved()
  }

  async function onArchive() {
    if (!area) return
    if (!confirm('Archive this area? It will be hidden from the public map.')) return
    const { error: err } = await archiveMemoryArea(supabase, area.id)
    if (err) setError(err)
    else onSaved()
  }

  return (
    <div className="mm-card space-y-3 rounded-2xl p-4">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Area name *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <select value={areaGroup} onChange={(e) => setAreaGroup(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
        <option value="outdoor">Outdoor</option>
        <option value="indoor">Indoor</option>
        <option value="offsite">Off-site</option>
        <option value="event">Event</option>
      </select>
      <select value={mapType} onChange={(e) => setMapType(e.target.value as 'geo' | 'image')} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
        <option value="geo">Geo Map</option>
        <option value="image">Uploaded School / Indoor Map</option>
      </select>
      {mapType === 'geo' ? (
        <>
          <input value={centreLat} onChange={(e) => setCentreLat(e.target.value)} placeholder="Centre latitude" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <input value={centreLng} onChange={(e) => setCentreLng(e.target.value)} placeholder="Centre longitude" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <textarea value={geofence} onChange={(e) => setGeofence(e.target.value)} placeholder="Geofence polygon JSON (optional)" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs" />
          <p className="mm-muted text-xs">Advanced geofence drawing can be added later.</p>
        </>
      ) : (
        <>
          <input type="file" accept="image/*" onChange={(e) => void onMapImage(e.target.files?.[0] ?? null)} className="w-full text-xs" />
          {mapImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mapImageUrl} alt="" className="max-h-32 w-full rounded-xl object-cover" />
          ) : null}
        </>
      )}
      <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" placeholder="Sort order" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">Save area</button>
        <button type="button" onClick={onCancel} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">Cancel</button>
        {area ? (
          <button type="button" onClick={() => void onArchive()} className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-bold text-red-300">Archive</button>
        ) : null}
      </div>
    </div>
  )
}
