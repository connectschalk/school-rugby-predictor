'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'

type Props = {
  mapId: string
  children: React.ReactNode
}

export default function RequireMemoryMapAdmin({ mapId, children }: Props) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'denied' | 'allowed'>('loading')

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session?.user) {
        setState('signed-out')
        return
      }
      const access = await fetchContributorAccess(supabase, mapId)
      setState(access.permissions.canAccessAdminDashboard ? 'allowed' : 'denied')
    })()
  }, [mapId])

  if (state === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-white/70">
        Checking admin access…
      </div>
    )
  }

  if (state === 'signed-out') {
    return (
      <MemoryMapSignInGate
        title="Sign in to manage Memory Maps"
        description="Use your NextPlay account to open the admin dashboard."
        returnPath={`/memory-map/admin/${mapId}`}
        backHref="/memory-map/admin"
        backLabel="Back to admin home"
      />
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-black">You do not have admin access</p>
        <p className="mm-muted max-w-sm text-sm">
          Only platform admins, organisation admins, map admins and moderators can access this dashboard.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <Link href="/memory-map/find" className="mm-btn-primary rounded-xl px-4 py-3 text-sm font-black">
            Find a Memory Map
          </Link>
          <Link href="/memory-map" className="mm-btn-secondary rounded-xl px-4 py-3 text-sm font-bold">
            Back to Memory Map
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
