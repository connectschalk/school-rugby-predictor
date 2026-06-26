'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildLoginHref } from '@/lib/auth-return-path'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import type { MemoryMap, MemoryMapBundle } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'

type Props = {
  bundle: MemoryMapBundle
  children: React.ReactNode
  returnPath: string
}

export default function MemoryMapVisibilityGate({ bundle, children, returnPath }: Props) {
  const { map } = bundle
  const [checking, setChecking] = useState(map.visibility === 'private')
  const [canView, setCanView] = useState(map.visibility !== 'private')

  useEffect(() => {
    if (map.visibility !== 'private') {
      setCanView(true)
      setChecking(false)
      return
    }
    void (async () => {
      const access = await fetchContributorAccess(supabase, map.id)
      setCanView(access.isMapAdmin || access.isContributor || access.member?.status === 'approved')
      setChecking(false)
    })()
  }, [map.id, map.visibility])

  if (map.status !== 'active') {
    return (
      <UnavailableState
        map={map}
        title="This Memory Map is not available"
        description="It may be in draft or has been archived. Contact your school admin for access."
      />
    )
  }

  if (checking) {
    return (
      <div className="mm-root flex min-h-dvh items-center justify-center text-sm text-white/70" style={memoryMapThemeVars(map)}>
        Loading…
      </div>
    )
  }

  if (!canView) {
    return (
      <UnavailableState
        map={map}
        title="This Memory Map is private"
        description="Request access or sign in with an approved account to view this map."
        showAuth
        showRequestAccess
        returnPath={returnPath}
        mapSlug={map.slug}
      />
    )
  }

  return <>{children}</>
}

function UnavailableState({
  map,
  title,
  description,
  showAuth,
  showRequestAccess,
  returnPath,
  mapSlug,
}: {
  map: MemoryMap
  title: string
  description: string
  showAuth?: boolean
  showRequestAccess?: boolean
  returnPath?: string
  mapSlug?: string
}) {
  return (
    <div className="mm-root flex min-h-dvh flex-col items-center justify-center px-6 text-center" style={memoryMapThemeVars(map)}>
      <div className="mm-card max-w-md rounded-2xl p-8">
        <h1 className="text-xl font-black">{title}</h1>
        <p className="mm-muted mt-3 text-sm leading-relaxed">{description}</p>
        <div className="mt-6 flex flex-col gap-2">
          {showRequestAccess && mapSlug ? (
            <Link href={`/memory-map/${mapSlug}/add`} className="mm-btn-primary rounded-xl px-4 py-3 text-sm font-black">
              Request access
            </Link>
          ) : null}
          {showAuth && returnPath ? (
            <Link href={buildLoginHref(returnPath)} className="mm-btn-secondary rounded-xl px-4 py-3 text-sm font-bold">
              Sign in
            </Link>
          ) : null}
          <Link href="/memory-map" className="mm-btn-secondary rounded-xl px-4 py-3 text-sm font-bold">
            Back to Memory Maps
          </Link>
        </div>
      </div>
    </div>
  )
}
