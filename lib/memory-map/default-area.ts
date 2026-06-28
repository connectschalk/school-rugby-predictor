import type { MemoryArea } from '@/lib/memory-map/types'

export type AreaRectangleBounds = {
  type: 'rectangle'
  north: number
  south: number
  east: number
  west: number
}

export function isSystemDefaultArea(area: MemoryArea): boolean {
  return area.is_system_default === true
}

export function activeAreasSorted(areas: MemoryArea[]): MemoryArea[] {
  return [...areas]
    .filter((a) => a.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export function customAreas(areas: MemoryArea[]): MemoryArea[] {
  return activeAreasSorted(areas).filter((a) => !isSystemDefaultArea(a))
}

export function hasOnlyGeneralArea(areas: MemoryArea[]): boolean {
  const active = activeAreasSorted(areas)
  return active.length === 1 && isSystemDefaultArea(active[0]!)
}

export function shouldShowAreaSelector(areas: MemoryArea[]): boolean {
  const active = activeAreasSorted(areas)
  if (active.length <= 1) return false
  return true
}

export function boundsCentre(bounds: AreaRectangleBounds): { lat: number; lng: number } {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  }
}

export function parseRectangleBounds(value: unknown): AreaRectangleBounds | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.type !== 'rectangle') return null
  const north = typeof row.north === 'number' ? row.north : NaN
  const south = typeof row.south === 'number' ? row.south : NaN
  const east = typeof row.east === 'number' ? row.east : NaN
  const west = typeof row.west === 'number' ? row.west : NaN
  if (![north, south, east, west].every(Number.isFinite)) return null
  return { type: 'rectangle', north, south, east, west }
}

export function buildRectangleBounds(
  cornerA: { lat: number; lng: number },
  cornerB: { lat: number; lng: number }
): AreaRectangleBounds {
  return {
    type: 'rectangle',
    north: Math.max(cornerA.lat, cornerB.lat),
    south: Math.min(cornerA.lat, cornerB.lat),
    east: Math.max(cornerA.lng, cornerB.lng),
    west: Math.min(cornerA.lng, cornerB.lng),
  }
}
