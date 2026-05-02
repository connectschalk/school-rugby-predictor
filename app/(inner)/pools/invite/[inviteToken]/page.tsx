'use client'

import { Suspense, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

/**
 * Alias URL for pool invites; redirects to canonical `/pools/join/[token]` with query preserved.
 * Existing share links use `/pools/join/...` — both stay valid.
 */
function InviteAliasInner() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  useEffect(() => {
    const raw = params.inviteToken
    const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
    let token = s ?? ''
    try {
      token = decodeURIComponent(token)
    } catch {
      /* keep raw */
    }
    const q = searchParams.toString()
    const path = `/pools/join/${encodeURIComponent(token)}${q ? `?${q}` : ''}`
    router.replace(path)
  }, [params.inviteToken, router, searchParams])

  return (
    <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
      <p className="text-sm text-gray-500">Opening invite…</p>
    </main>
  )
}

export default function PoolInviteAliasPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      }
    >
      <InviteAliasInner />
    </Suspense>
  )
}
