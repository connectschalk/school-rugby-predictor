'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import MemoryMapSignInGate from '@/components/memory-map/MemoryMapSignInGate'
import MemoryMapOrganisationDetailPanel from '@/components/memory-map/MemoryMapOrganisationDetailPanel'
import {
  fetchOrganisationBySlugForCurrentUser,
  organisationDashboardPath,
  type OrganisationAccessLevel,
  type OrganisationRow,
} from '@/lib/memory-map/organisations'

type Props = {
  organisationSlug: string
}

export default function OrganisationDashboardPanel({ organisationSlug }: Props) {
  const returnPath = organisationDashboardPath(organisationSlug)
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'signed-out' }
    | { kind: 'forbidden' }
    | { kind: 'not-found' }
    | { kind: 'ready'; organisation: OrganisationRow; accessLevel: OrganisationAccessLevel }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    void (async () => {
      const result = await fetchOrganisationBySlugForCurrentUser(supabase, organisationSlug)
      if (result.signedOut) {
        setState({ kind: 'signed-out' })
        return
      }
      if (result.error) {
        setState({ kind: 'error', message: result.error })
        return
      }
      if (result.forbidden) {
        setState({ kind: 'forbidden' })
        return
      }
      if (!result.organisation || !result.accessLevel) {
        setState({ kind: 'not-found' })
        return
      }
      setState({
        kind: 'ready',
        organisation: result.organisation,
        accessLevel: result.accessLevel,
      })
    })()
  }, [organisationSlug])

  if (state.kind === 'loading') {
    return <p className="mm-muted px-5 py-10 text-sm">Loading organisation…</p>
  }

  if (state.kind === 'signed-out') {
    return (
      <MemoryMapSignInGate
        title="Sign in to your organisation"
        description="Sign in with the account that was invited to manage this organisation."
        returnPath={returnPath}
      />
    )
  }

  if (state.kind === 'forbidden') {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-center">
        <h1 className="text-2xl font-black">Access denied</h1>
        <p className="mm-muted mt-3 text-sm">
          You do not have permission to manage this organisation. Contact a platform admin if you need access.
        </p>
        <Link href="/memory-map" className="mm-btn-secondary mt-6 inline-block rounded-xl px-4 py-3 text-sm font-bold">
          Back to Memory Map
        </Link>
      </main>
    )
  }

  if (state.kind === 'not-found') {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-center">
        <h1 className="text-2xl font-black">Organisation not found</h1>
        <p className="mm-muted mt-3 text-sm">This organisation does not exist or is not available.</p>
        <Link href="/memory-map" className="mm-btn-secondary mt-6 inline-block rounded-xl px-4 py-3 text-sm font-bold">
          Back to Memory Map
        </Link>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <p className="text-sm text-red-300">{state.message}</p>
      </main>
    )
  }

  const backHref = state.accessLevel === 'platform_admin' ? '/memory-map/admin/organisations' : '/memory-map'
  const backLabel = state.accessLevel === 'platform_admin' ? 'Back to organisations' : 'Back to Memory Map'

  return (
    <MemoryMapOrganisationDetailPanel
      organisation={state.organisation}
      accessLevel={state.accessLevel}
      backHref={backHref}
      backLabel={backLabel}
      showPlatformAdminShortcut={state.accessLevel === 'platform_admin'}
    />
  )
}
