'use client'

import { Suspense } from 'react'
import MemoryMapTopMenu from '@/components/memory-map/MemoryMapTopMenu'

type Props = {
  children: React.ReactNode
}

export default function MemoryMapLayoutClient({ children }: Props) {
  return (
    <>
      <Suspense fallback={null}>
        <MemoryMapTopMenu />
      </Suspense>
      <div className="mm-layout-content">{children}</div>
    </>
  )
}
