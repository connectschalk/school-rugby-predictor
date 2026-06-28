import { describe, expect, it } from 'vitest'
import {
  buildRectangleBounds,
  customAreas,
  hasOnlyGeneralArea,
  isSystemDefaultArea,
  shouldShowAreaSelector,
} from './default-area'
import type { MemoryArea } from './types'

function area(partial: Partial<MemoryArea> & Pick<MemoryArea, 'id' | 'name'>): MemoryArea {
  return {
    memory_map_id: 'map-1',
    description: null,
    map_type: 'geo',
    geofence_polygon: null,
    centre_lat: null,
    centre_lng: null,
    default_zoom: 17,
    default_x_position: null,
    default_y_position: null,
    default_image_zoom: null,
    map_image_url: null,
    image_width: null,
    image_height: null,
    sort_order: 0,
    is_active: true,
    ...partial,
  }
}

describe('default area helpers', () => {
  it('detects system default area', () => {
    expect(isSystemDefaultArea(area({ id: '1', name: 'General', is_system_default: true }))).toBe(true)
    expect(isSystemDefaultArea(area({ id: '2', name: 'Campus' }))).toBe(false)
  })

  it('filters custom areas', () => {
    const areas = [
      area({ id: '1', name: 'General', is_system_default: true, sort_order: -1 }),
      area({ id: '2', name: 'Rugby Field', sort_order: 1 }),
    ]
    expect(customAreas(areas).map((a) => a.name)).toEqual(['Rugby Field'])
  })

  it('detects only General area', () => {
    expect(hasOnlyGeneralArea([area({ id: '1', name: 'General', is_system_default: true })])).toBe(true)
    expect(
      hasOnlyGeneralArea([
        area({ id: '1', name: 'General', is_system_default: true }),
        area({ id: '2', name: 'Hall' }),
      ])
    ).toBe(false)
  })

  it('hides area selector for a single area', () => {
    expect(shouldShowAreaSelector([area({ id: '1', name: 'General', is_system_default: true })])).toBe(false)
    expect(
      shouldShowAreaSelector([
        area({ id: '1', name: 'General', is_system_default: true }),
        area({ id: '2', name: 'Hall' }),
      ])
    ).toBe(true)
  })

  it('builds rectangle bounds from corners', () => {
    expect(buildRectangleBounds({ lat: -33.1, lng: 18.4 }, { lat: -33.2, lng: 18.5 })).toEqual({
      type: 'rectangle',
      north: -33.1,
      south: -33.2,
      east: 18.5,
      west: 18.4,
    })
  })
})
