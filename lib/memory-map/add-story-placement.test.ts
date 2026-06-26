import { describe, expect, it } from 'vitest'
import { DEMO_MEMORY_MAP_BUNDLE } from './demo-data'
import {
  findNearestGeoArea,
  getNearbyPins,
  haversineKm,
  resolveUploadMode,
} from './add-story-placement'

describe('haversineKm', () => {
  it('returns zero for identical points', () => {
    expect(haversineKm(-33.925, 18.425, -33.925, 18.425)).toBe(0)
  })

  it('returns small distance for nearby points', () => {
    const d = haversineKm(-33.9256, 18.4252, -33.9253, 18.4248)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(0.2)
  })
})

describe('findNearestGeoArea', () => {
  it('picks closest geo area to coordinates', () => {
    const area = findNearestGeoArea(DEMO_MEMORY_MAP_BUNDLE.areas, -33.9256, 18.4252)
    expect(area?.name).toBe('Main Rugby Field')
  })
})

describe('getNearbyPins', () => {
  it('finds geo pins within radius', () => {
    const nearby = getNearbyPins(
      DEMO_MEMORY_MAP_BUNDLE.pins,
      'area-field',
      { lat: -33.9256, lng: 18.4252 }
    )
    expect(nearby.some((p) => p.id === 'pin-scoreboard')).toBe(true)
  })
})

describe('resolveUploadMode', () => {
  const geoArea = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.map_type === 'geo')!
  const imageArea = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.map_type === 'image')!

  it('maps placement methods to upload modes', () => {
    expect(resolveUploadMode('current', geoArea, false)).toBe('current_location')
    expect(resolveUploadMode('manual', geoArea, false)).toBe('manual_geo')
    expect(resolveUploadMode('manual', imageArea, false)).toBe('manual_image_map')
    expect(resolveUploadMode('manual', geoArea, true)).toBe('archive_submission')
  })
})
