import { describe, expect, it } from 'vitest'
import { DEMO_MEMORY_MAP_BUNDLE } from './demo-data'
import {
  FALLBACK_GEO,
  formatStoryReviewLocationSummary,
  getAreaDefaultCenter,
  getImageMapInitialFocus,
  getMapInitialView,
  getMemoryMapDefaultCenter,
  getPinMoveInitialView,
  getStoryReviewMapInitialView,
  isFarFromArea,
  isValidLatLng,
  isValidZoom,
} from './map-starting-point'

describe('isValidLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isValidLatLng(-33.925, 18.425)).toBe(true)
  })
  it('rejects out of range', () => {
    expect(isValidLatLng(91, 0)).toBe(false)
    expect(isValidLatLng(0, 181)).toBe(false)
  })
})

describe('isValidZoom', () => {
  it('accepts 1–22', () => {
    expect(isValidZoom(17)).toBe(true)
    expect(isValidZoom(0)).toBe(false)
    expect(isValidZoom(23)).toBe(false)
  })
})

describe('getMemoryMapDefaultCenter', () => {
  it('returns map defaults when set', () => {
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, default_lat: -33.9249, default_lng: 18.4241, default_zoom: 17 }
    const c = getMemoryMapDefaultCenter(map)
    expect(c?.lat).toBe(-33.9249)
    expect(c?.zoom).toBe(17)
  })
})

describe('getAreaDefaultCenter', () => {
  it('prefers area centre over map default', () => {
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, default_lat: -33.9, default_lng: 18.4, default_zoom: 17 }
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const c = getAreaDefaultCenter(area, map)
    expect(c?.lat).toBe(-33.9255)
    expect(c?.lng).toBe(18.425)
  })

  it('falls back to map default', () => {
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, default_lat: -33.9249, default_lng: 18.4241, default_zoom: 17 }
    const area = { ...DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-hostel')!, centre_lat: null, centre_lng: null }
    const c = getAreaDefaultCenter(area, map)
    expect(c?.lat).toBe(-33.9249)
  })
})

describe('getMapInitialView', () => {
  it('uses area centre first', () => {
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const view = getMapInitialView({
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(view.lat).toBe(-33.9255)
  })

  it('uses first pin when area has no centre', () => {
    const area = {
      ...DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-hostel')!,
      centre_lat: null,
      centre_lng: null,
      default_x_position: 50,
      default_y_position: 50,
    }
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, default_lat: null, default_lng: null }
    const view = getMapInitialView({ area, memoryMap: map, pins: [] })
    expect(view).toEqual(FALLBACK_GEO)
  })
})

describe('getImageMapInitialFocus', () => {
  it('uses area default x/y', () => {
    const area = { ...DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-hostel')!, default_x_position: 42, default_y_position: 58 }
    expect(getImageMapInitialFocus(area)).toEqual({ x: 42, y: 58 })
  })
})

describe('getPinMoveInitialView', () => {
  it('starts at pin geo coordinates', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-scoreboard')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const { geo } = getPinMoveInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(geo.lat).toBe(-33.9256)
    expect(geo.lng).toBe(18.4252)
  })
})

describe('getStoryReviewMapInitialView', () => {
  it('centres geo review on pin lat/lng, not area centre', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-pavilion')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const view = getStoryReviewMapInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(view.source).toBe('pin')
    expect(view.geo.lat).toBe(-33.9253)
    expect(view.geo.lng).toBe(18.4248)
    expect(view.geo.lat).not.toBe(area.centre_lat)
  })

  it('uses area default zoom then map default zoom', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-scoreboard')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const view = getStoryReviewMapInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(view.geo.zoom).toBe(18)
  })

  it('centres image review on pin x/y', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-hostel-hall')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-hostel')!
    const view = getStoryReviewMapInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(view.source).toBe('pin')
    expect(view.image.x).toBe(pin.x_position)
    expect(view.image.y).toBe(pin.y_position)
  })

  it('follows live placement when admin moves pin', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-scoreboard')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const view = getStoryReviewMapInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
      placement: { lat: -33.926, lng: 18.426, x: null, y: null },
    })
    expect(view.geo.lat).toBe(-33.926)
    expect(view.geo.lng).toBe(18.426)
  })

  it('falls back to area centre when pin has no coordinates', () => {
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const pin = {
      ...DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-scoreboard')!,
      lat: null,
      lng: null,
    }
    const view = getStoryReviewMapInitialView({
      pin,
      area,
      memoryMap: DEMO_MEMORY_MAP_BUNDLE.map,
      pins: DEMO_MEMORY_MAP_BUNDLE.pins,
    })
    expect(view.source).toBe('area')
    expect(view.geo.lat).toBe(area.centre_lat)
  })
})

describe('formatStoryReviewLocationSummary', () => {
  it('formats geo coordinates', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-scoreboard')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    expect(formatStoryReviewLocationSummary(area, pin)).toContain('-33.92560')
  })

  it('formats image map percentages', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins.find((p) => p.id === 'pin-hostel-hall')!
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-hostel')!
    expect(formatStoryReviewLocationSummary(area, pin)).toContain('% on school map')
  })
})

describe('isFarFromArea', () => {
  it('detects distant coordinates', () => {
    const area = DEMO_MEMORY_MAP_BUNDLE.areas.find((a) => a.id === 'area-field')!
    const map = DEMO_MEMORY_MAP_BUNDLE.map
    expect(isFarFromArea(-34.5, 19, area, map, 5)).toBe(true)
    expect(isFarFromArea(-33.9256, 18.4252, area, map, 5)).toBe(false)
  })
})
