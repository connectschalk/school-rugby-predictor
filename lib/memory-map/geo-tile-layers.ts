export type GeoBaseLayer = 'map' | 'satellite'

export const GEO_BASE_LAYER_OPTIONS: { id: GeoBaseLayer; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'satellite', label: 'Satellite' },
]

export type GeoTileLayerConfig = {
  url: string
  attribution: string
  maxZoom: number
}

export function geoTileLayerConfig(layer: GeoBaseLayer): GeoTileLayerConfig {
  if (layer === 'satellite') {
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }
  }

  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }
}
