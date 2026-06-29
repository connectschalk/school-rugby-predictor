'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'
import {
  createMemoryMapForOrganisation,
  fetchOrganisationBySlugForCurrentUser,
  organisationDashboardPath,
} from '@/lib/memory-map/organisations'
import { suggestCreateMapSlugs, suggestMemoryMapTitle } from '@/lib/memory-map/create-map-form'

type Props = {
  organisationSlug: string
}

export default function OrganisationCreateMapPanel({ organisationSlug }: Props) {
  const router = useRouter()
  const returnPath = `${organisationDashboardPath(organisationSlug)}/maps/new`
  const [gate, setGate] = useState<'loading' | 'signed-out' | 'forbidden' | 'ready'>('loading')
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [mapTitle, setMapTitle] = useState('')
  const [mapSlug, setMapSlug] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await fetchOrganisationBySlugForCurrentUser(supabase, organisationSlug)
      if (result.signedOut) {
        setGate('signed-out')
        return
      }
      if (result.forbidden || !result.organisation || !result.accessLevel) {
        setGate('forbidden')
        return
      }
      setOrganisationId(result.organisation.id)
      setOrganisationName(result.organisation.name)
      const title = suggestMemoryMapTitle(result.organisation.name)
      setMapTitle(title)
      setMapSlug(suggestCreateMapSlugs(result.organisation.name, title).mapSlug)
      setGate('ready')
    })()
  }, [organisationSlug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { mapId, error: createErr } = await createMemoryMapForOrganisation(supabase, organisationId, {
      mapTitle: mapTitle.trim(),
      mapSlug: mapSlug.trim(),
    })
    setBusy(false)
    if (createErr || !mapId) {
      setError(createErr ?? 'Could not create map.')
      return
    }
    router.push(`/memory-map/admin/${mapId}`)
  }

  if (gate === 'loading') {
    return <p className="mm-muted px-5 py-10 text-sm">Loading…</p>
  }

  if (gate === 'signed-out') {
    return (
      <MemoryMapSignInGate
        title="Sign in to create a map"
        description="Sign in to create a Memory Map for your organisation."
        returnPath={returnPath}
        backHref={organisationDashboardPath(organisationSlug)}
        backLabel="Back to organisation"
      />
    )
  }

  if (gate === 'forbidden') {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-center">
        <h1 className="text-2xl font-black">Access denied</h1>
        <Link href="/memory-map" className="mm-btn-secondary mt-6 inline-block rounded-xl px-4 py-3 text-sm font-bold">
          Back to Memory Map
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">Create Memory Map</p>
      <h1 className="mt-3 text-2xl font-black">{organisationName}</h1>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
        <label className="block text-xs font-bold text-white/90">
          Map title
          <input
            value={mapTitle}
            onChange={(e) => setMapTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </label>
        <label className="block text-xs font-bold text-white/90">
          Map URL slug
          <input
            value={mapSlug}
            onChange={(e) => setMapSlug(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={busy} className="mm-btn-primary w-full rounded-xl py-3 text-sm font-black disabled:opacity-50">
          {busy ? 'Creating…' : 'Create map'}
        </button>
      </form>
      <Link
        href={organisationDashboardPath(organisationSlug)}
        className="mm-btn-secondary mt-6 block rounded-xl py-3 text-center text-sm font-bold"
      >
        Cancel
      </Link>
    </main>
  )
}
