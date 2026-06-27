'use client'

import AdminGeoMapPicker from '@/components/memory-map/admin/AdminGeoMapPicker'
import { FALLBACK_GEO, getMemoryMapDefaultCenter } from '@/lib/memory-map/map-starting-point'
import type { MemoryMap } from '@/lib/memory-map/types'

type Props = {
  map: MemoryMap
  message: string
  children?: React.ReactNode
  className?: string
}

/** Read-only map preview when no area is available yet. */
export default function MemoryMapShell({ map, message, children, className = '' }: Props) {
  const centre = getMemoryMapDefaultCenter(map) ?? FALLBACK_GEO

  return (
    <div className={`relative ${className}`}>
      <AdminGeoMapPicker
        lat={centre.lat}
        lng={centre.lng}
        zoom={centre.zoom}
        defaultCentre={centre}
        pickMode={false}
        className="opacity-90"
        onChange={() => {}}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div className="mm-card pointer-events-auto max-w-sm rounded-2xl p-4 text-center shadow-lg">
          <p className="text-sm leading-relaxed text-white/90">{message}</p>
          {children ? <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div> : null}
        </div>
      </div>
    </div>
  )
}
