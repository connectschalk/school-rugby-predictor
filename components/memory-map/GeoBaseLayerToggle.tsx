'use client'

import { GEO_BASE_LAYER_OPTIONS, type GeoBaseLayer } from '@/lib/memory-map/geo-tile-layers'

type Props = {
  layer: GeoBaseLayer
  onChange: (layer: GeoBaseLayer) => void
}

export default function GeoBaseLayerToggle({ layer, onChange }: Props) {
  return (
    <div className="mm-card inline-flex rounded-full p-1" role="group" aria-label="Map base layer">
      {GEO_BASE_LAYER_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={layer === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            layer === option.id ? 'mm-btn-primary' : 'text-white/70'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
