import type { MemoryArea, MemoryMap, MemoryPin } from '@/lib/memory-map/types'

export type GeoView = {
  lat: number
  lng: number
  zoom: number
}

export type ImageFocus = {
  x: number
  y: number
}

/** Last-resort centre when no admin or pin data exists (Paarl region). */
export const FALLBACK_GEO: GeoView = { lat: -33.925, lng: 18.425, zoom: 16 }

export const FALLBACK_IMAGE: ImageFocus = { x: 50, y: 50 }

export function isValidLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return false
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function isValidZoom(zoom: number | null | undefined): boolean {
  if (zoom == null || Number.isNaN(zoom)) return false
  return zoom >= 1 && zoom <= 22
}

export function clampZoom(zoom: number | null | undefined, fallback: number): number {
  if (isValidZoom(zoom)) return Math.round(zoom!)
  return fallback
}

export function getMemoryMapDefaultCenter(map: MemoryMap): GeoView | null {
  if (!isValidLatLng(map.default_lat, map.default_lng)) return null
  return {
    lat: map.default_lat!,
    lng: map.default_lng!,
    zoom: clampZoom(map.default_zoom, 17),
  }
}

/** Area centre overrides Memory Map default when set. */
export function getAreaDefaultCenter(area: MemoryArea, memoryMap: MemoryMap): GeoView | null {
  if (isValidLatLng(area.centre_lat, area.centre_lng)) {
    return {
      lat: area.centre_lat!,
      lng: area.centre_lng!,
      zoom: clampZoom(area.default_zoom, clampZoom(memoryMap.default_zoom, 18)),
    }
  }
  return getMemoryMapDefaultCenter(memoryMap)
}

export function getFirstPinGeoView(pins: MemoryPin[], areaId: string): GeoView | null {
  const pin = pins.find(
    (p) => p.area_id === areaId && p.status === 'approved' && isValidLatLng(p.lat, p.lng)
  )
  if (!pin || pin.lat == null || pin.lng == null) return null
  return { lat: pin.lat, lng: pin.lng, zoom: 18 }
}

/**
 * Public map / manual placement initial geo view.
 * Priority: area centre → map default → first pin in area → hard fallback.
 */
export function getMapInitialView({
  area,
  memoryMap,
  pins,
}: {
  area: MemoryArea
  memoryMap: MemoryMap
  pins: MemoryPin[]
}): GeoView {
  return (
    getAreaDefaultCenter(area, memoryMap) ??
    getFirstPinGeoView(pins, area.id) ??
    FALLBACK_GEO
  )
}

export function getImageMapInitialFocus(area: MemoryArea): ImageFocus {
  const x = area.default_x_position
  const y = area.default_y_position
  if (x != null && y != null && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
    return { x, y }
  }
  return FALLBACK_IMAGE
}

export function getPinMoveInitialView({
  pin,
  area,
  memoryMap,
  pins,
}: {
  pin: MemoryPin
  area: MemoryArea
  memoryMap: MemoryMap
  pins: MemoryPin[]
}): { geo: GeoView; image: ImageFocus } {
  if (area.map_type === 'image') {
    const x = pin.x_position ?? area.default_x_position ?? FALLBACK_IMAGE.x
    const y = pin.y_position ?? area.default_y_position ?? FALLBACK_IMAGE.y
    return {
      geo: getMapInitialView({ area, memoryMap, pins }),
      image: {
        x: x >= 0 && x <= 100 ? x : FALLBACK_IMAGE.x,
        y: y >= 0 && y <= 100 ? y : FALLBACK_IMAGE.y,
      },
    }
  }

  if (isValidLatLng(pin.lat, pin.lng)) {
    return {
      geo: { lat: pin.lat!, lng: pin.lng!, zoom: clampZoom(area.default_zoom, 18) },
      image: getImageMapInitialFocus(area),
    }
  }

  return {
    geo: getMapInitialView({ area, memoryMap, pins }),
    image: getImageMapInitialFocus(area),
  }
}

/** Rough distance check — user seems away from school/area. */
export function isFarFromArea(
  lat: number,
  lng: number,
  area: MemoryArea,
  memoryMap: MemoryMap,
  thresholdKm = 5
): boolean {
  const centre = getAreaDefaultCenter(area, memoryMap) ?? getMemoryMapDefaultCenter(memoryMap)
  if (!centre) return false
  const d = haversineKm(lat, lng, centre.lat, centre.lng)
  return d > thresholdKm
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
