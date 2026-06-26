'use client'

import { Suspense, useMemo } from 'react'
import { useParams } from 'next/navigation'
import PoolInviteLanding from '@/components/pools/PoolInviteLanding'

function JoinPoolInner() {
  const params = useParams()
  const token = useMemo(() => {
    const raw = params.token
    const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
    try {
      return decodeURIComponent(s ?? '').trim()
    } catch {
      return (s ?? '').trim()
    }
  }, [params.token])

  return <PoolInviteLanding inviteToken={token} />
}

export default function PoolJoinClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      }
    >
      <JoinPoolInner />
    </Suspense>
  )
}
