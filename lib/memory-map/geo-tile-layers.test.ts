import { describe, expect, it } from 'vitest'
import { geoTileLayerConfig } from './geo-tile-layers'

describe('geoTileLayerConfig', () => {
  it('returns OpenStreetMap for map layer', () => {
    const config = geoTileLayerConfig('map')
    expect(config.url).toContain('openstreetmap.org')
    expect(config.maxZoom).toBe(19)
  })

  it('returns Esri imagery for satellite layer', () => {
    const config = geoTileLayerConfig('satellite')
    expect(config.url).toContain('World_Imagery')
    expect(config.maxZoom).toBe(19)
  })
})
