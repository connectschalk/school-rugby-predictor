import type { MapPlacement, MemoryArea, MemoryMap, MemoryPin } from '@/lib/memory-map/types'

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

export function getFirstPinGeoView(
  pins: MemoryPin[],
  areaId: string,
  options?: { approvedOnly?: boolean }
): GeoView | null {
  const approvedOnly = options?.approvedOnly ?? true
  const pin = pins.find(
    (p) =>
      p.area_id === areaId &&
      isValidLatLng(p.lat, p.lng) &&
      (!approvedOnly || p.status === 'approved')
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
  const view = getStoryReviewMapInitialView({
    pin,
    area,
    memoryMap,
    pins,
    placement: {
      lat: pin.lat,
      lng: pin.lng,
      x: pin.x_position,
      y: pin.y_position,
    },
  })
  return { geo: view.geo, image: view.image }
}

export function getReviewMapZoom(area: MemoryArea, memoryMap: MemoryMap): number {
  return clampZoom(area.default_zoom, clampZoom(memoryMap.default_zoom, 18))
}

export function getFirstPinImageFocus(pins: MemoryPin[], areaId: string): ImageFocus | null {
  const pin = pins.find(
    (p) =>
      p.area_id === areaId &&
      p.x_position != null &&
      p.y_position != null &&
      p.x_position >= 0 &&
      p.x_position <= 100 &&
      p.y_position >= 0 &&
      p.y_position <= 100
  )
  if (!pin || pin.x_position == null || pin.y_position == null) return null
  return { x: pin.x_position, y: pin.y_position }
}

export type StoryReviewMapView = {
  geo: GeoView
  image: ImageFocus
  pinId: string | null
  source: 'pin' | 'area' | 'map' | 'first_pin' | 'fallback'
}

function pinPlacementFromInput(
  pin: MemoryPin | null,
  placement?: MapPlacement | null
): { lat: number | null; lng: number | null; x: number | null; y: number | null } {
  return {
    lat: placement?.lat ?? pin?.lat ?? null,
    lng: placement?.lng ?? pin?.lng ?? null,
    x: placement?.x ?? pin?.x_position ?? null,
    y: placement?.y ?? pin?.y_position ?? null,
  }
}

/**
 * Admin story review map centre — always prefers the story pin (or live placement) over area/map defaults.
 */
export function getStoryReviewMapInitialView({
  pin,
  area,
  memoryMap,
  pins,
  placement,
}: {
  pin: MemoryPin | null
  area: MemoryArea
  memoryMap: MemoryMap
  pins: MemoryPin[]
  placement?: MapPlacement | null
}): StoryReviewMapView {
  const zoom = getReviewMapZoom(area, memoryMap)
  const pinId = pin?.id ?? null
  const coords = pinPlacementFromInput(pin, placement)

  if (area.map_type === 'image') {
    if (coords.x != null && coords.y != null && coords.x >= 0 && coords.x <= 100 && coords.y >= 0 && coords.y <= 100) {
      return {
        geo: getMapInitialView({ area, memoryMap, pins }),
        image: { x: coords.x, y: coords.y },
        pinId,
        source: 'pin',
      }
    }

    const areaFocus = getImageMapInitialFocus(area)
    if (area.default_x_position != null && area.default_y_position != null) {
      return {
        geo: getMapInitialView({ area, memoryMap, pins }),
        image: areaFocus,
        pinId,
        source: 'area',
      }
    }

    const firstPinFocus = getFirstPinImageFocus(pins, area.id)
    if (firstPinFocus) {
      return {
        geo: getMapInitialView({ area, memoryMap, pins }),
        image: firstPinFocus,
        pinId,
        source: 'first_pin',
      }
    }

    return {
      geo: getMapInitialView({ area, memoryMap, pins }),
      image: FALLBACK_IMAGE,
      pinId,
      source: 'fallback',
    }
  }

  if (isValidLatLng(coords.lat, coords.lng)) {
    return {
      geo: { lat: coords.lat!, lng: coords.lng!, zoom },
      image: getImageMapInitialFocus(area),
      pinId,
      source: 'pin',
    }
  }

  const areaCenter = getAreaDefaultCenter(area, memoryMap)
  if (areaCenter) {
    return {
      geo: areaCenter,
      image: getImageMapInitialFocus(area),
      pinId,
      source: 'area',
    }
  }

  const mapDefault = getMemoryMapDefaultCenter(memoryMap)
  if (mapDefault) {
    return {
      geo: mapDefault,
      image: getImageMapInitialFocus(area),
      pinId,
      source: 'map',
    }
  }

  const firstPinGeo = getFirstPinGeoView(pins, area.id, { approvedOnly: false })
  if (firstPinGeo) {
    return {
      geo: { ...firstPinGeo, zoom },
      image: getImageMapInitialFocus(area),
      pinId,
      source: 'first_pin',
    }
  }

  return {
    geo: FALLBACK_GEO,
    image: getImageMapInitialFocus(area),
    pinId,
    source: 'fallback',
  }
}

export function formatStoryReviewLocationSummary(
  area: MemoryArea,
  pin: MemoryPin | null,
  placement?: MapPlacement | null
): string | null {
  const coords = pinPlacementFromInput(pin, placement)
  if (area.map_type === 'image') {
    if (coords.x == null || coords.y == null) return null
    return `Reviewing location: ${coords.x.toFixed(1)}%, ${coords.y.toFixed(1)}% on school map`
  }
  if (!isValidLatLng(coords.lat, coords.lng)) return null
  return `Reviewing location: ${coords.lat!.toFixed(5)}, ${coords.lng!.toFixed(5)}`
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
