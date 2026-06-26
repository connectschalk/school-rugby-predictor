'use client'

import type { MemoryArea, MemoryPin, MapPlacement } from '@/lib/memory-map/types'
import type { GeoView, ImageFocus } from '@/lib/memory-map/map-starting-point'
import MemoryPinMarker from '@/components/memory-map/MemoryPinMarker'

type Props = {
  area: MemoryArea
  pins: MemoryPin[]
  onPinClick: (pin: MemoryPin) => void
  placementMode?: boolean
  placementPreview?: MapPlacement | null
  onMapClick?: (placement: MapPlacement) => void
  showPlacementDebug?: boolean
  fallbackLabel?: string
  initialView?: GeoView | null
}

function geoToPercent(lat: number, lng: number, area: MemoryArea, initialView?: GeoView | null): { left: string; top: string } {
  const centreLat = initialView?.lat ?? area.centre_lat ?? -33.925
  const centreLng = initialView?.lng ?? area.centre_lng ?? 18.425
  const dx = (lng - centreLng) * 12000
  const dy = (lat - centreLat) * -12000
  return {
    left: `${Math.min(95, Math.max(5, 50 + dx))}%`,
    top: `${Math.min(95, Math.max(5, 50 + dy))}%`,
  }
}

export default function MockGeoMapCanvas({
  area,
  pins,
  onPinClick,
  placementMode = false,
  placementPreview,
  onMapClick,
  showPlacementDebug = false,
  fallbackLabel = 'Geo preview',
  initialView,
}: Props) {
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placementMode || !onMapClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    const centreLat = initialView?.lat ?? area.centre_lat ?? -33.925
    const centreLng = initialView?.lng ?? area.centre_lng ?? 18.425
    const dx = (xPct - 50) / 12000
    const dy = (yPct - 50) / -12000
    onMapClick({ lat: centreLat + dy, lng: centreLng + dx })
  }

  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628] ${
        placementMode ? 'cursor-crosshair ring-2 ring-[var(--mm-accent)]' : ''
      }`}
      onClick={handleClick}
      role={placementMode ? 'button' : undefined}
      aria-label={placementMode ? 'Tap to place pin' : undefined}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundColor: '#0b1220',
        }}
      />
      <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/80">
        {fallbackLabel}
      </div>
      {pins.map((pin) => {
        const pos =
          pin.lat != null && pin.lng != null
            ? geoToPercent(pin.lat, pin.lng, area, initialView)
            : { left: '50%', top: '50%' }
        return (
          <MemoryPinMarker key={pin.id} pin={pin} onClick={() => onPinClick(pin)} style={{ left: pos.left, top: pos.top }} />
        )
      })}
      {placementPreview?.lat != null && placementPreview?.lng != null ? (
        <span
          className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--mm-accent)] text-xs font-black text-black"
          style={geoToPercent(placementPreview.lat, placementPreview.lng, area, initialView)}
        >
          +
        </span>
      ) : null}
      {showPlacementDebug && placementPreview?.lat != null ? (
        <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/60">
          {placementPreview.lat.toFixed(5)}, {placementPreview.lng?.toFixed(5)}
        </p>
      ) : null}
    </div>
  )
}
