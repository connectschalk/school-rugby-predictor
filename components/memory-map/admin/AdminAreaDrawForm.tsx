'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { upsertMemoryArea } from '@/lib/memory-map/mutations'
import { boundsCentre, type AreaRectangleBounds } from '@/lib/memory-map/default-area'
import { getMemoryMapDefaultCenter } from '@/lib/memory-map/map-starting-point'
import type { MemoryMap } from '@/lib/memory-map/types'
import AdminAreaBoundsPicker from '@/components/memory-map/admin/AdminAreaBoundsPicker'

type Props = {
  mapId: string
  map: MemoryMap
  onSaved: () => void
  onCancel: () => void
}

export default function AdminAreaDrawForm({ mapId, map, onSaved, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bounds, setBounds] = useState<AreaRectangleBounds | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const defaultCentre = getMemoryMapDefaultCenter(map) ?? { lat: -33.9249, lng: 18.4241, zoom: 17 }

  async function onSave() {
    setError('')
    if (!name.trim()) {
      setError('Enter a name for this area.')
      return
    }
    if (!bounds) {
      setError('Draw a rectangle on the map first.')
      return
    }
    const centre = boundsCentre(bounds)
    setSaving(true)
    const { error: err } = await upsertMemoryArea(supabase, {
      mapId,
      name: name.trim(),
      description: description.trim(),
      areaGroup: 'outdoor',
      mapType: 'geo',
      centreLat: centre.lat,
      centreLng: centre.lng,
      defaultZoom: defaultCentre.zoom,
      bounds,
      createdFrom: 'map_draw',
      sortOrder: 1,
      isActive: true,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    onSaved()
  }

  return (
    <div className="mm-card space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-base font-black">Draw area on map</h2>
        <p className="mm-muted mt-2 text-sm leading-relaxed">
          Drag a rectangle around the place you want to group memories for, then name and save the area.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <AdminAreaBoundsPicker defaultCentre={defaultCentre} bounds={bounds} onChange={setBounds} />

      <label className="block">
        <span className="mm-muted mb-1 block text-xs font-semibold">Area name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rugby Field"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="mm-muted mb-1 block text-xs font-semibold">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
      </label>

      {bounds ? (
        <p className="mm-muted text-xs">
          Bounds: {bounds.south.toFixed(5)} to {bounds.north.toFixed(5)} lat, {bounds.west.toFixed(5)} to{' '}
          {bounds.east.toFixed(5)} lng
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save area'}
        </button>
        <button type="button" onClick={onCancel} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
          Cancel
        </button>
      </div>
    </div>
  )
}
