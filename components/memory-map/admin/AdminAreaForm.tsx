'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { archiveMemoryArea, upsertMemoryArea } from '@/lib/memory-map/mutations'
import { MM_BUCKET_BACKGROUNDS, MM_MAX_BACKGROUND_BYTES, uploadMemoryMapImage } from '@/lib/memory-map/storage'
import { getMemoryMapDefaultCenter } from '@/lib/memory-map/map-starting-point'
import { isSystemDefaultArea } from '@/lib/memory-map/default-area'
import type { MemoryArea, MemoryMap } from '@/lib/memory-map/types'
import AdminGeoMapPicker, { useBrowserGeo } from '@/components/memory-map/admin/AdminGeoMapPicker'
import { imagePercentToStylePosition } from '@/lib/memory-map/map-placement'

type Props = {
  mapId: string
  map: MemoryMap
  area?: MemoryArea | null
  onSaved: () => void
  onCancel: () => void
}

export default function AdminAreaForm({ mapId, map, area, onSaved, onCancel }: Props) {
  const [name, setName] = useState(area?.name ?? '')
  const [description, setDescription] = useState(area?.description ?? '')
  const [areaGroup, setAreaGroup] = useState(area?.area_group ?? 'outdoor')
  const [mapType, setMapType] = useState<'geo' | 'image'>(area?.map_type ?? 'geo')
  const [centreLat, setCentreLat] = useState(String(area?.centre_lat ?? ''))
  const [centreLng, setCentreLng] = useState(String(area?.centre_lng ?? ''))
  const [defaultZoom, setDefaultZoom] = useState(String(area?.default_zoom ?? 18))
  const [defaultX, setDefaultX] = useState(String(area?.default_x_position ?? 50))
  const [defaultY, setDefaultY] = useState(String(area?.default_y_position ?? 50))
  const [geofence, setGeofence] = useState(area?.geofence_polygon ? JSON.stringify(area.geofence_polygon) : '')
  const [mapImageUrl, setMapImageUrl] = useState(area?.map_image_url ?? '')
  const [sortOrder, setSortOrder] = useState(String(area?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(area?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const geo = useBrowserGeo()

  const fieldLabelClass = 'mb-1 block text-xs font-semibold text-white/90'
  const fieldHelperClass = 'mm-muted mt-1 text-xs leading-relaxed'
  const fieldInputClass = 'w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm'

  useEffect(() => {
    if (geo.coords) {
      setCentreLat(String(geo.coords.lat))
      setCentreLng(String(geo.coords.lng))
    }
  }, [geo.coords])

  const latNum = centreLat ? parseFloat(centreLat) : null
  const lngNum = centreLng ? parseFloat(centreLng) : null
  const zoomNum = parseInt(defaultZoom, 10) || 18
  const xNum = parseFloat(defaultX) || 50
  const yNum = parseFloat(defaultY) || 50

  async function onMapImage(file: File | null) {
    if (!file) return
    const up = await uploadMemoryMapImage(supabase, MM_BUCKET_BACKGROUNDS, mapId, `area-${Date.now()}`, file, MM_MAX_BACKGROUND_BYTES)
    if ('error' in up) {
      setError(up.error)
      return
    }
    setMapImageUrl(up.url)
  }

  function useMapDefault() {
    const c = getMemoryMapDefaultCenter(map)
    if (c) {
      setCentreLat(String(c.lat))
      setCentreLng(String(c.lng))
      setDefaultZoom(String(c.zoom))
    }
  }

  function onImageFocusClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10
    setDefaultX(String(x))
    setDefaultY(String(y))
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
      centreLat: latNum,
      centreLng: lngNum,
      defaultZoom: zoomNum,
      defaultXPosition: xNum,
      defaultYPosition: yNum,
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
    <div className="mm-card space-y-5 rounded-2xl p-4">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabelClass}>Area name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Rugby Field" className={fieldInputClass} />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description for visitors" rows={2} className={fieldInputClass} />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Area group</span>
          <select value={areaGroup} onChange={(e) => setAreaGroup(e.target.value)} className={fieldInputClass}>
            <option value="outdoor">Outdoor</option>
            <option value="indoor">Indoor</option>
            <option value="offsite">Off-site</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Map type</span>
          <select value={mapType} onChange={(e) => setMapType(e.target.value as 'geo' | 'image')} className={fieldInputClass}>
            <option value="geo">Geo Map</option>
            <option value="image">Uploaded School / Indoor Map</option>
          </select>
        </label>
      </div>

      {mapType === 'geo' ? (
        <div className="space-y-4 rounded-xl border border-white/10 p-4">
          <div>
            <h4 className="text-sm font-black">Area starting point</h4>
            <p className={fieldHelperClass}>
              Choose the starting view for this area. Contributors placing a pin manually will start here.
            </p>
          </div>
          <AdminGeoMapPicker
            lat={latNum}
            lng={lngNum}
            zoom={zoomNum}
            defaultCentre={getMemoryMapDefaultCenter(map)}
            onChange={(lat, lng) => {
              setCentreLat(String(lat))
              setCentreLng(String(lng))
            }}
            onZoomChange={(z) => setDefaultZoom(String(z))}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={fieldLabelClass}>Latitude</span>
              <input value={centreLat} onChange={(e) => setCentreLat(e.target.value)} placeholder="-33.9249" className={fieldInputClass} />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>Longitude</span>
              <input value={centreLng} onChange={(e) => setCentreLng(e.target.value)} placeholder="18.4241" className={fieldInputClass} />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>Default zoom</span>
              <input value={defaultZoom} onChange={(e) => setDefaultZoom(e.target.value)} type="number" min={1} max={22} placeholder="18" className={fieldInputClass} />
            </label>
          </div>
          <p className={fieldHelperClass}>These values control where this area opens by default on the map.</p>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => geo.request()} disabled={geo.loading} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold" title="Set the starting point to your current GPS location">
                {geo.loading ? 'Finding location…' : 'Use current location'}
              </button>
              <button type="button" onClick={useMapDefault} className="mm-btn-secondary rounded-xl px-3 py-2 text-xs font-bold" title="Copy the Memory Map-wide default starting point">
                Use Memory Map default
              </button>
            </div>
            <p className={fieldHelperClass}>
              Use current location if you are standing in this area. Use Memory Map default to match the school-wide map centre.
            </p>
          </div>
          <details className="rounded-xl border border-white/10 bg-white/[0.02]">
            <summary className="cursor-pointer px-3 py-3 text-sm font-bold text-white/90">Advanced geofence settings</summary>
            <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
              <p className={fieldHelperClass}>Optional. Use this only if you want to define a boundary around this area.</p>
              <label className="block">
                <span className={fieldLabelClass}>Geofence polygon JSON</span>
                <textarea
                  value={geofence}
                  onChange={(e) => setGeofence(e.target.value)}
                  placeholder='{"type":"Polygon","coordinates":[...]}'
                  rows={3}
                  className={`${fieldInputClass} font-mono text-xs`}
                />
              </label>
            </div>
          </details>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-white/10 p-4">
          <div>
            <h4 className="text-sm font-black">Default map view</h4>
            <p className={fieldHelperClass}>Tap the school map to set the default focus point.</p>
          </div>
          <label className="block">
            <span className={fieldLabelClass}>School / indoor map image</span>
            <input type="file" accept="image/*" onChange={(e) => void onMapImage(e.target.files?.[0] ?? null)} className="w-full text-xs" />
          </label>
          <div
            className="relative aspect-[4/3] cursor-crosshair overflow-hidden rounded-xl border border-white/10 bg-[#0a1628]"
            onClick={onImageFocusClick}
            role="button"
            aria-label="Pick default focus on school map"
          >
            <div
              className="absolute inset-0 bg-cover opacity-90"
              style={{
                backgroundImage: mapImageUrl
                  ? `url(${mapImageUrl})`
                  : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #14532d 100%)',
                backgroundPosition: `${xNum}% ${yNum}%`,
              }}
            />
            <span
              className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white mm-bg-accent text-[10px] font-black text-black"
              style={imagePercentToStylePosition(xNum, yNum)}
            >
              ●
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabelClass}>Focus X (%)</span>
              <input value={defaultX} onChange={(e) => setDefaultX(e.target.value)} placeholder="50" className={fieldInputClass} />
            </label>
            <label className="block">
              <span className={fieldLabelClass}>Focus Y (%)</span>
              <input value={defaultY} onChange={(e) => setDefaultY(e.target.value)} placeholder="50" className={fieldInputClass} />
            </label>
          </div>
        </div>
      )}

      <div className="space-y-4 border-t border-white/10 pt-4">
        <label className="block">
          <span className={fieldLabelClass}>Display order</span>
          <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} type="number" placeholder="0" className={fieldInputClass} />
          <p className={fieldHelperClass}>Lower numbers appear first in the area list.</p>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block text-sm font-semibold">Active area</span>
            <span className={fieldHelperClass}>Only active areas are visible on the public Memory Map.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
        <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">Save area</button>
        <button type="button" onClick={onCancel} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">Cancel</button>
        {area && !isSystemDefaultArea(area) ? (
          <button type="button" onClick={() => void onArchive()} className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-bold text-red-300">Archive</button>
        ) : null}
      </div>
    </div>
  )
}
