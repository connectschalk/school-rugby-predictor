'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { fetchPoolByInviteToken, requestJoinPool, type PoolInvitePreview } from '@/lib/pools'
import { supabase } from '@/lib/supabase'

export default function PoolJoinPage() {
  const params = useParams()

  const token = useMemo(() => {
    const raw = params.token
    const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : ''
    try {
      return decodeURIComponent(s ?? '')
    } catch {
      return s ?? ''
    }
  }, [params.token])

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [pool, setPool] = useState<PoolInvitePreview | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingPool, setLoadingPool] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [requestErr, setRequestErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!authReady || !user || !token.trim()) {
      return
    }
    let cancelled = false
    setLoadingPool(true)
    setLoadError('')
    void fetchPoolByInviteToken(supabase, token).then(({ pool: p, error }) => {
      if (cancelled) return
      setLoadingPool(false)
      if (error) {
        setLoadError(error.message)
        setPool(null)
        return
      }
      setPool(p)
      if (!p) {
        setLoadError('This invite link is invalid or the pool is no longer available.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [authReady, user, token])

  async function onRequestJoin() {
    if (!pool) return
    setRequestBusy(true)
    setRequestErr('')
    setSuccessMsg('')
    const { error } = await requestJoinPool(supabase, pool.id, token)
    setRequestBusy(false)
    if (error) {
      setRequestErr(error.message)
      return
    }
    setSuccessMsg('Request sent. The pool admin must approve you.')
  }

  if (!authReady) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    )
  }

  if (!token.trim()) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Join pool</h1>
        <p className="mt-4 text-sm text-gray-600">This invite link is missing or invalid.</p>
        <Link
          href="/pools"
          className="mt-6 inline-block text-sm font-semibold text-red-700 underline underline-offset-2"
        >
          Back to Pools
        </Link>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Join pool</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-600">
          Log in or sign up to request access to this pool.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex rounded-xl border border-gray-900 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Sign up
          </Link>
        </div>
        <p className="mt-10 text-sm">
          <Link href="/pools" className="font-semibold text-red-700 underline underline-offset-2">
            Back to Pools
          </Link>
        </p>
      </main>
    )
  }

  if (loadingPool) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <p className="text-sm text-gray-500">Loading pool…</p>
      </main>
    )
  }

  if (loadError || !pool) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">Join pool</h1>
        <p className="mt-4 text-sm text-red-800">{loadError || 'Pool not found.'}</p>
        <Link
          href="/pools"
          className="mt-6 inline-block text-sm font-semibold text-red-700 underline underline-offset-2"
        >
          Back to Pools
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
      <h1 className="text-2xl font-black tracking-tight text-gray-900">Request to join</h1>
      <p className="mt-4 text-lg font-semibold text-gray-900">{pool.name}</p>
      <p className="mt-1 text-xs text-gray-500">{pool.is_public ? 'Public pool' : 'Private pool'}</p>

      <button
        type="button"
        disabled={requestBusy || Boolean(successMsg)}
        onClick={() => void onRequestJoin()}
        className="mt-8 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        {requestBusy ? 'Sending…' : successMsg ? 'Request sent' : 'Request to join'}
      </button>

      {successMsg ? <p className="mt-4 text-sm font-medium text-emerald-800">{successMsg}</p> : null}
      {requestErr ? <p className="mt-4 text-sm text-red-800">{requestErr}</p> : null}

      <Link
        href="/pools"
        className="mt-10 inline-block text-sm font-semibold text-gray-700 underline underline-offset-2"
      >
        Back to Pools
      </Link>
    </main>
  )
}
