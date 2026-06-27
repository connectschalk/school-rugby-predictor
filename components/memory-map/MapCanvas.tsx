'use client'

import type { MemoryArea, MemoryPin, MapPlacement } from '@/lib/memory-map/types'
import type { GeoView, ImageFocus } from '@/lib/memory-map/map-starting-point'
import {
  clientPointToImagePercent,
  containerBoundsFromRect,
  imagePercentToStylePosition,
} from '@/lib/memory-map/map-placement'
import MemoryPinMarker from '@/components/memory-map/MemoryPinMarker'
import GeoMapCanvas from '@/components/memory-map/GeoMapCanvas'

type Props = {
  area: MemoryArea
  pins: MemoryPin[]
  mode: 'geo' | 'image'
  onPinClick: (pin: MemoryPin) => void
  placementMode?: boolean
  placementPreview?: MapPlacement | null
  onMapClick?: (placement: MapPlacement) => void
  showPlacementDebug?: boolean
  locateTarget?: { lat: number; lng: number; zoom?: number } | null
  userLocation?: { lat: number; lng: number } | null
  initialView?: GeoView | null
  imageFocus?: ImageFocus | null
  embedded?: boolean
  highlightedPinId?: string | null
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
  locateTarget,
  userLocation,
  initialView,
  imageFocus,
  embedded = false,
  highlightedPinId,
}: Props) {
  const isImage = mode === 'image' || area.map_type === 'image'
  const wrapperClass = embedded ? '' : 'mx-4 mb-4'

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placementMode || !onMapClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const bounds = containerBoundsFromRect(rect)
    const pt = clientPointToImagePercent(e.clientX, e.clientY, bounds)
    onMapClick({ x: pt.x, y: pt.y })
  }

  if (!isImage) {
    return (
      <div className={wrapperClass}>
        <GeoMapCanvas
          area={area}
          pins={pins}
          onPinClick={onPinClick}
          placementMode={placementMode}
          placementPreview={placementPreview}
          onMapClick={onMapClick}
          showPlacementDebug={showPlacementDebug}
          locateTarget={locateTarget}
          userLocation={userLocation}
          initialView={initialView}
          highlightedPinId={highlightedPinId}
        />
      </div>
    )
  }

  const focusX = imageFocus?.x ?? 50
  const focusY = imageFocus?.y ?? 50

  return (
    <div className={wrapperClass}>
      <p className="mm-muted mb-2 px-1 text-xs">Indoor maps use manual pin placement.</p>
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628] ${
          placementMode ? 'cursor-crosshair mm-ring-accent-2' : ''
        }`}
        onClick={handleImageClick}
        role={placementMode ? 'button' : undefined}
        aria-label={placementMode ? 'Tap to place pin' : undefined}
      >
        <div
          className="absolute inset-0 bg-cover opacity-90"
          style={{
            backgroundImage: area.map_image_url
              ? `url(${area.map_image_url})`
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #14532d 100%)',
            backgroundPosition: `${focusX}% ${focusY}%`,
          }}
        />
        {pins.map((pin) => {
          const pos = imagePercentToStylePosition(pin.x_position ?? 50, pin.y_position ?? 50)
          return (
            <MemoryPinMarker
              key={pin.id}
              pin={pin}
              highlighted={highlightedPinId === pin.id}
              onClick={() => onPinClick(pin)}
              style={{ left: pos.left, top: pos.top }}
            />
          )
        })}
        {placementPreview?.x != null && placementPreview?.y != null ? (
          <span
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white mm-bg-accent text-xs font-black text-black"
            style={imagePercentToStylePosition(placementPreview.x, placementPreview.y)}
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
