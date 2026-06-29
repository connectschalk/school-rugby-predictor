'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchMemoryMapPlatformAdmin } from '@/lib/admin-access'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'

type Props = {
  children: React.ReactNode
  returnPath?: string
}

export default function RequireMemoryMapPlatformAdmin({ children, returnPath = '/memory-map/admin/organisations' }: Props) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'denied' | 'allowed'>('loading')

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setState('signed-out')
        return
      }
      const { isAdmin } = await fetchMemoryMapPlatformAdmin(supabase, userId)
      setState(isAdmin ? 'allowed' : 'denied')
    })()
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-white/70">
        Checking platform admin access…
      </div>
    )
  }

  if (state === 'signed-out') {
    return (
      <MemoryMapSignInGate
        title="Sign in as platform admin"
        description="Memory Map platform admin access is required."
        returnPath={returnPath}
        backHref="/memory-map/admin"
      />
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-black">Platform admin access required</p>
        <p className="mm-muted max-w-sm text-sm">
          Only Memory Map platform admins can manage organisations and send organisation admin invites.
        </p>
        <Link href="/memory-map/admin" className="mm-btn-primary rounded-xl px-4 py-3 text-sm font-black">
          Back to admin home
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
