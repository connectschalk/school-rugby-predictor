'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchContributorAccess } from '@/lib/memory-map/membership'

type Props = {
  mapId: string
  children: React.ReactNode
}

export default function RequireMemoryMapAdmin({ mapId, children }: Props) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    void (async () => {
      const access = await fetchContributorAccess(supabase, mapId)
      setState(access.isMapAdmin ? 'allowed' : 'denied')
    })()
  }, [mapId])

  if (state === 'loading') {
    return (
      <div className="mm-root flex min-h-dvh items-center justify-center text-sm text-white/70">
        Checking admin access…
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="mm-root flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-black">Admin access required</p>
        <p className="mm-muted max-w-sm text-sm">
          Only Memory Map admins and moderators can access this dashboard. Contributors cannot manage settings here.
        </p>
        <Link href="/memory-map" className="mm-btn-primary rounded-xl px-4 py-3 text-sm font-black">
          Back to Memory Map
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
