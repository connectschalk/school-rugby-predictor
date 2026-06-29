'use client'

import type { ReactNode } from 'react'
import type { MemoryMapBranding } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'

type Props = {
  map?: Partial<MemoryMapBranding> | null
  className?: string
  children: ReactNode
}

/** Applies map branding CSS variables — required for portaled modals outside the layout tree. */
export default function MemoryMapThemedRoot({ map, className = '', children }: Props) {
  return (
    <div className={className ? `mm-root ${className}` : 'mm-root'} style={memoryMapThemeVars(map)}>
      {children}
    </div>
  )
}
