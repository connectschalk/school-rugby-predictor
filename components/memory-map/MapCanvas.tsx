'use client'

import type { MemoryArea, MemoryPin, MapPlacement } from '@/lib/memory-map/types'
import {
  clientPointToImagePercent,
  containerBoundsFromRect,
  imagePercentToStylePosition,
} from '@/lib/memory-map/map-placement'
import MemoryPinMarker from '@/components/memory-map/MemoryPinMarker'

type Props = {
  area: MemoryArea
  pins: MemoryPin[]
  mode: 'geo' | 'image'
  onPinClick: (pin: MemoryPin) => void
  placementMode?: boolean
  placementPreview?: MapPlacement | null
  onMapClick?: (placement: MapPlacement) => void
  showPlacementDebug?: boolean
}

function geoToPercent(lat: number, lng: number, area: MemoryArea): { left: string; top: string } {
  const centreLat = area.centre_lat ?? -33.925
  const centreLng = area.centre_lng ?? 18.425
  const dx = (lng - centreLng) * 12000
  const dy = (lat - centreLat) * -12000
  const left = `${Math.min(95, Math.max(5, 50 + dx))}%`
  const top = `${Math.min(95, Math.max(5, 50 + dy))}%`
  return { left, top }
}

export default function MapCanvas({
  area,
  pins,
  mode,
  onPinClick,
  placementMode = false,
  placementPreview,
  onMapClick,
  showPlacementDebug = false,
}: Props) {
  const isImage = mode === 'image' || area.map_type === 'image'

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placementMode || !onMapClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (isImage) {
      const bounds = containerBoundsFromRect(rect)
      const pt = clientPointToImagePercent(e.clientX, e.clientY, bounds)
      onMapClick({ x: pt.x, y: pt.y })
    } else {
      const xPct = ((e.clientX - rect.left) / rect.width) * 100
      const yPct = ((e.clientY - rect.top) / rect.height) * 100
      const centreLat = area.centre_lat ?? -33.925
      const centreLng = area.centre_lng ?? 18.425
      const dx = (xPct - 50) / 12000
      const dy = (yPct - 50) / -12000
      onMapClick({ lat: centreLat + dy, lng: centreLng + dx })
    }
  }

  return (
    <div className="mx-4 mb-4">
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628] ${
          placementMode ? 'cursor-crosshair ring-2 ring-[var(--mm-accent)]' : ''
        }`}
        onClick={handleClick}
        role={placementMode ? 'button' : undefined}
        aria-label={placementMode ? 'Tap to place pin' : undefined}
      >
        {isImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-90"
            style={{
              backgroundImage: area.map_image_url
                ? `url(${area.map_image_url})`
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #14532d 100%)',
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              backgroundColor: '#0b1220',
            }}
          />
        )}

        {!isImage ? (
          <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/80">
            Geo preview
          </div>
        ) : null}

        {pins.map((pin) => {
          const pos = isImage
            ? imagePercentToStylePosition(pin.x_position ?? 50, pin.y_position ?? 50)
            : pin.lat != null && pin.lng != null
              ? geoToPercent(pin.lat, pin.lng, area)
              : { left: '50%', top: '50%' }

          return (
            <MemoryPinMarker
              key={pin.id}
              pin={pin}
              onClick={() => onPinClick(pin)}
              style={{ left: pos.left, top: pos.top }}
            />
          )
        })}

        {placementPreview ? (
          <span
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--mm-accent)] text-xs font-black text-black"
            style={
              isImage
                ? imagePercentToStylePosition(placementPreview.x ?? 50, placementPreview.y ?? 50)
                : placementPreview.lat != null && placementPreview.lng != null
                  ? geoToPercent(placementPreview.lat, placementPreview.lng, area)
                  : { left: '50%', top: '50%' }
            }
          >
            +
          </span>
        ) : null}
      </div>
      {showPlacementDebug && placementPreview?.x != null && placementPreview?.y != null ? (
        <p className="mm-muted mt-1 text-center text-[10px]">
          Position: {placementPreview.x}%, {placementPreview.y}%
        </p>
      ) : null}
    </div>
  )
}
