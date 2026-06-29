'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ORG_TYPE_LABELS } from '@/lib/memory-map/create-map-form'
import { fetchOrganisations } from '@/lib/memory-map/organisations'

export default function MemoryMapAdminOrganisationsPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [organisations, setOrganisations] = useState<Awaited<ReturnType<typeof fetchOrganisations>>['organisations']>([])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const result = await fetchOrganisations(supabase)
      setOrganisations(result.organisations)
      setError(result.error ?? '')
      setLoading(false)
    })()
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">Platform admin</p>
      <h1 className="mt-3 text-2xl font-black">Organisations</h1>
      <p className="mm-muted mt-2 text-sm">
        Create schools, events and places, then invite organisation admins by email.
      </p>

      <Link
        href="/memory-map/admin/organisations/new"
        className="mm-btn-primary mt-6 inline-block rounded-2xl px-5 py-3 text-center text-sm font-black"
      >
        Create organisation
      </Link>

      {loading ? (
        <p className="mm-muted mt-8 text-sm">Loading organisations…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-300">{error}</p>
      ) : organisations.length === 0 ? (
        <p className="mm-muted mt-8 text-sm">No organisations yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {organisations.map((org) => (
            <li key={org.id}>
              <Link
                href={`/memory-map/admin/organisations/${org.id}`}
                className="mm-card mm-card-interactive block rounded-2xl p-4"
              >
                <p className="font-black">{org.name}</p>
                <p className="mm-muted mt-1 text-xs">
                  {ORG_TYPE_LABELS[org.type] ?? org.type} · /{org.slug}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/memory-map/admin" className="mm-btn-secondary mt-8 rounded-2xl px-5 py-3 text-center text-sm font-bold">
        Back to admin home
      </Link>
    </main>
  )
}
