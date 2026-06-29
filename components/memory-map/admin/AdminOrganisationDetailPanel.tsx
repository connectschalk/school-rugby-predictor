'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchMemoryMapPlatformAdmin } from '@/lib/admin-access'
import MemoryMapOrganisationDetailPanel from '@/components/memory-map/MemoryMapOrganisationDetailPanel'
import { fetchOrganisationById } from '@/lib/memory-map/organisations'

type Props = {
  organisationId: string
}

export default function AdminOrganisationDetailPanel({ organisationId }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [org, setOrg] = useState<Awaited<ReturnType<typeof fetchOrganisationById>>['organisation']>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setError('Sign in required.')
        setLoading(false)
        return
      }
      const { isAdmin } = await fetchMemoryMapPlatformAdmin(supabase, userId)
      if (!isAdmin) {
        setError('Platform admin access required.')
        setLoading(false)
        return
      }
      const orgRes = await fetchOrganisationById(supabase, organisationId)
      setOrg(orgRes.organisation)
      setError(orgRes.error ?? '')
      setLoading(false)
    })()
  }, [organisationId])

  if (loading) {
    return <p className="mm-muted px-5 py-10 text-sm">Loading organisation…</p>
  }

  if (!org) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm text-red-300">{error || 'Organisation not found.'}</p>
      </main>
    )
  }

  return (
    <MemoryMapOrganisationDetailPanel
      organisation={org}
      accessLevel="platform_admin"
      backHref="/memory-map/admin/organisations"
      backLabel="Back to organisations"
    />
  )
}
