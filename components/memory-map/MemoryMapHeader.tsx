'use client'

import Link from 'next/link'
import type { MemoryMap } from '@/lib/memory-map/types'

type Props = {
  map: MemoryMap
  mapSlug: string
  areaName?: string
  backHref?: string
  rightSlot?: React.ReactNode
}

export default function MemoryMapHeader({ map, mapSlug, areaName, backHref, rightSlot }: Props) {
  return (
    <header className="mm-card flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3">
      <Link
        href={backHref ?? `/memory-map/${mapSlug}`}
        className="mm-btn-secondary rounded-full px-3 py-1.5 text-xs font-bold"
      >
        ← Back
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black">{map.title}</p>
        {areaName ? <p className="mm-muted truncate text-xs">{areaName}</p> : null}
      </div>
      {map.profile_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={map.profile_image_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
      ) : null}
      {rightSlot}
    </header>
  )
}
