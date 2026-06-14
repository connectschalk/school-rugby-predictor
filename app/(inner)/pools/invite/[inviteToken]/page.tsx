'use client'

import { Suspense, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { buildPoolJoinPath, POOL_INVITE_FROM_PARAM } from '@/lib/pool-invite-path'
import { fetchPoolInviteByToken } from '@/lib/pools'
import { supabase } from '@/lib/supabase'

/**
 * Alias URL for pool invites; redirects to canonical competition join URL with query preserved.
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
      token = decodeURIComponent(token).trim()
    } catch {
      token = token.trim()
    }
    const fromParam = searchParams.get(POOL_INVITE_FROM_PARAM)

    if (!token) {
      router.replace('/pools')
      return
    }

    let cancelled = false
    void (async () => {
      const { pool } = await fetchPoolInviteByToken(supabase, token)
      if (cancelled) return
      const target = pool
        ? buildPoolJoinPath(pool.invite_token || token, fromParam, pool.competition_slug)
        : `/pools/join/${encodeURIComponent(token)}${fromParam ? `?${POOL_INVITE_FROM_PARAM}=${encodeURIComponent(fromParam)}` : ''}`
      router.replace(target)
    })()

    return () => {
      cancelled = true
    }
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
