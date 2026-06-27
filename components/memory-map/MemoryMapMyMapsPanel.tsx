'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchMyMemoryMapEntries, type MyMemoryMapEntry } from '@/lib/memory-map/my-maps'
import { memberRoleLabel } from '@/lib/memory-map/menu-role'
import { accessLevelLabel } from '@/lib/memory-map/permissions'
import { logMemoryMapPublicLink, memoryMapPublicPath } from '@/lib/memory-map/public-links'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'

function entryRoleLabel(entry: MyMemoryMapEntry): string {
  if (entry.role === 'platform_admin') return 'Platform admin'
  if (entry.role === 'organisation_admin') return 'Organisation admin'
  if (
    entry.accessLevel === 'platform' ||
    entry.accessLevel === 'organisation' ||
    entry.accessLevel === 'map_admin' ||
    entry.accessLevel === 'moderator'
  ) {
    return accessLevelLabel(entry.accessLevel)
  }
  return memberRoleLabel(entry.role, entry.memberStatus)
}

export default function MemoryMapMyMapsPanel() {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [entries, setEntries] = useState<MyMemoryMapEntry[]>([])

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setSignedIn(false)
        setLoading(false)
        return
      }
      setSignedIn(true)
      const rows = await fetchMyMemoryMapEntries(supabase, userId)
      setEntries(rows)
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <p className="mm-muted px-5 py-10 text-sm">Loading your maps…</p>
  }

  if (!signedIn) {
    return (
      <MemoryMapSignInGate
        title="My Memory Maps"
        description="Sign in to see maps where you contribute, moderate or admin."
        returnPath="/memory-map/my"
      />
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-black">My Memory Maps</h1>
      <p className="mm-muted mt-2 text-sm">Maps where you are a member, contributor or admin.</p>

      {entries.length === 0 ? (
        <div className="mm-card mt-8 rounded-2xl p-6">
          <p className="text-sm">You are not a member of any Memory Maps yet.</p>
          <Link href="/memory-map/find" className="mm-btn-primary mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold">
            Find a Memory Map
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {entries.map((entry) => (
            <li key={entry.mapId} className="mm-card rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">{entry.mapTitle}</p>
                  <p className="mm-muted mt-1 text-xs">
                    {entry.organisationName} · {entryRoleLabel(entry)} · {entry.mapStatus}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={memoryMapPublicPath(entry.mapSlug, 'map')}
                    onClick={() =>
                      logMemoryMapPublicLink({
                        mapId: entry.mapId,
                        mapSlug: entry.mapSlug,
                        href: memoryMapPublicPath(entry.mapSlug, 'map'),
                      })
                    }
                    className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold"
                  >
                    Open map
                  </Link>
                  {entry.canAddMemory ? (
                    <Link href={memoryMapPublicPath(entry.mapSlug, 'add')} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
                      Add memory
                    </Link>
                  ) : null}
                  {entry.canOpenAdmin ? (
                    <Link href={`/memory-map/admin/${entry.mapId}`} className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold">
                      Admin
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
