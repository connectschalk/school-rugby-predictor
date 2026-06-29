'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchMemoryMapPlatformAdmin } from '@/lib/admin-access'
import { DEMO_MAP_ID } from '@/lib/memory-map/constants'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'
import {
  accessLevelLabel,
  type AccessibleMemoryMap,
  type MemoryMapAccessLevel,
} from '@/lib/memory-map/permissions'

type RpcRow = {
  map_id: string
  map_slug: string
  map_title: string
  map_status: string
  organisation_id: string
  organisation_name: string
  organisation_slug: string
  access_level: string
}

function mapRpcRow(row: RpcRow): AccessibleMemoryMap {
  return {
    mapId: String(row.map_id),
    mapSlug: String(row.map_slug),
    mapTitle: String(row.map_title),
    mapStatus: String(row.map_status),
    organisationId: String(row.organisation_id),
    organisationName: String(row.organisation_name),
    organisationSlug: String(row.organisation_slug),
    accessLevel: row.access_level as MemoryMapAccessLevel,
  }
}

export default function MemoryMapAdminIndexPanel() {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [isAppAdmin, setIsAppAdmin] = useState(false)
  const [maps, setMaps] = useState<AccessibleMemoryMap[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setSignedIn(false)
        setLoading(false)
        return
      }

      setSignedIn(true)
      const adminCheck = await fetchMemoryMapPlatformAdmin(supabase, userId)
      setIsAppAdmin(adminCheck.isAdmin)

      const { data, error: rpcError } = await supabase.rpc('list_accessible_memory_maps')
      if (rpcError) {
        setError(rpcError.message)
        setMaps([])
      } else {
        setMaps((data as RpcRow[] | null)?.map(mapRpcRow) ?? [])
      }
      setLoading(false)
    })()
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">NextPlay Memory Map</p>
      <h1 className="mt-3 text-2xl font-black">Memory Map Admin</h1>
      <p className="mm-muted mt-3 text-sm">
        Platform admins see all maps. Organisation admins see their organisation. Map admins and moderators see assigned maps only.
      </p>

      {loading ? (
        <p className="mm-muted mt-8 text-sm">Loading admin access…</p>
      ) : !signedIn ? (
        <MemoryMapSignInGate
          title="Sign in to manage Memory Maps"
          description="Use your NextPlay account to open the admin dashboard."
          returnPath="/memory-map/admin"
          backHref="/memory-map"
        />
      ) : (
        <>
          {error ? (
            <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Could not load your maps: {error}
            </p>
          ) : null}

          {isAppAdmin ? (
            <Link
              href="/memory-map/admin/create"
              className="mm-btn-primary mt-8 inline-block rounded-2xl px-5 py-4 text-center text-sm font-black"
            >
              Create new Memory Map
            </Link>
          ) : (
            <p className="mm-muted mt-8 text-xs">
              Creating new organisations and Memory Maps is limited to platform admins.
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-black">Your Memory Maps</h2>
          {maps.length === 0 && !isAppAdmin ? (
            <div className="mt-8 space-y-3">
              <p className="text-lg font-black">You do not have admin access</p>
              <p className="mm-muted text-sm">Ask a platform or organisation admin for access to manage Memory Maps.</p>
              <Link href="/memory-map/find" className="mm-btn-primary inline-block rounded-xl px-4 py-3 text-sm font-black">
                Find a Memory Map
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {maps.map((map) => (
                <li key={map.mapId}>
                  <Link
                    href={`/memory-map/admin/${map.mapId}`}
                    className="mm-card mm-card-interactive block rounded-2xl p-4"
                  >
                    <p className="font-black">{map.mapTitle}</p>
                    <p className="mm-muted mt-1 text-xs">
                      {map.organisationName} · {accessLevelLabel(map.accessLevel)} · {map.mapStatus}
                    </p>
                    <span className="mm-text-accent mt-2 inline-block text-xs font-bold">Open admin →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </section>

          <Link
            href={`/memory-map/admin/${DEMO_MAP_ID}`}
            className="mm-btn-secondary mt-6 inline-block rounded-2xl px-5 py-3 text-center text-sm font-bold"
          >
            Open Boishaai demo admin
          </Link>
        </>
      )}

      <Link href="/memory-map" className="mm-btn-secondary mt-8 rounded-2xl px-5 py-4 text-center text-sm font-bold">
        Back to Memory Map home
      </Link>
    </main>
  )
}
