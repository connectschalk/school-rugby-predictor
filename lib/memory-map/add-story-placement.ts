import type { MapPlacement, MemoryArea, MemoryPin, UploadMode } from '@/lib/memory-map/types'

const EARTH_RADIUS_KM = 6371

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function findNearestGeoArea(areas: MemoryArea[], lat: number, lng: number): MemoryArea | null {
  const geoAreas = areas.filter((a) => a.is_active && a.map_type === 'geo')
  if (geoAreas.length === 0) return null

  let best: MemoryArea | null = null
  let bestDist = Infinity
  for (const area of geoAreas) {
    if (area.centre_lat == null || area.centre_lng == null) continue
    const d = haversineKm(lat, lng, area.centre_lat, area.centre_lng)
    if (d < bestDist) {
      bestDist = d
      best = area
    }
  }
  return best ?? geoAreas[0] ?? null
}

function imagePercentDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

export function getNearbyPins(
  pins: MemoryPin[],
  areaId: string,
  placement: MapPlacement | null,
  options?: { geoRadiusKm?: number; imageRadiusPercent?: number }
): MemoryPin[] {
  const geoRadius = options?.geoRadiusKm ?? 0.15
  const imageRadius = options?.imageRadiusPercent ?? 12

  const inArea = pins.filter((p) => p.status === 'approved' && p.area_id === areaId)
  if (!placement) return inArea

  if (placement.lat != null && placement.lng != null) {
    return inArea
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ pin: p, d: haversineKm(placement.lat!, placement.lng!, p.lat!, p.lng!) }))
      .filter(({ d }) => d <= geoRadius)
      .sort((a, b) => a.d - b.d)
      .map(({ pin }) => pin)
  }

  if (placement.x != null && placement.y != null) {
    return inArea
      .filter((p) => p.x_position != null && p.y_position != null)
      .map((p) => ({
        pin: p,
        d: imagePercentDistance(placement.x!, placement.y!, p.x_position!, p.y_position!),
      }))
      .filter(({ d }) => d <= imageRadius)
      .sort((a, b) => a.d - b.d)
      .map(({ pin }) => pin)
  }

  return inArea
}

export function resolveUploadMode(
  placeMethod: 'current' | 'manual',
  area: MemoryArea,
  isArchiveMemory: boolean
): UploadMode {
  if (isArchiveMemory) return 'archive_submission'
  if (placeMethod === 'current') return 'current_location'
  return area.map_type === 'image' ? 'manual_image_map' : 'manual_geo'
}

export function locationMethodUserLabel(mode: UploadMode): string {
  switch (mode) {
    case 'current_location':
      return 'Current location'
    case 'manual_geo':
      return 'Manual map placement'
    case 'manual_image_map':
      return 'Indoor / school map'
    case 'archive_submission':
      return 'Old memory'
    default:
      return mode
  }
}

export function canProceedFromPinChoice(
  selectedPinId: string | null,
  newPinTitle: string,
  pinPlacement: MapPlacement | null,
  area: MemoryArea | undefined
): boolean {
  if (selectedPinId) return true
  if (!newPinTitle.trim() || !area) return false
  if (area.map_type === 'geo') {
    return pinPlacement?.lat != null && pinPlacement?.lng != null
  }
  if (area.map_type === 'image') {
    return pinPlacement?.x != null && pinPlacement?.y != null
  }
  return false
}

export function activeAreas(areas: MemoryArea[]): MemoryArea[] {
  return [...areas].filter((a) => a.is_active).sort((a, b) => a.sort_order - b.sort_order)
}
