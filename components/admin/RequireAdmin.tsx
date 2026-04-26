'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'
import AdminToolsNav from '@/components/admin/AdminToolsNav'

type GateState = 'loading' | 'denied' | 'ok'

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>('loading')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }
      const { isAdmin, error } = await fetchUserIsAdmin(supabase, session.user.id)
      if (cancelled) return
      if (error) {
        setState('denied')
        return
      }
      setState(isAdmin ? 'ok' : 'denied')
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  if (state === 'loading') {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 text-gray-700">
        <p className="text-sm font-medium text-gray-800">Checking access…</p>
      </main>
    )
  }

  if (state === 'denied') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Access denied</h1>
        <p className="mt-3 text-sm text-gray-600">
          This area is only available to accounts with admin access.
        </p>
        <Link
          href="/predict-score"
          className="mt-8 inline-flex rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Go to Predict a Score
        </Link>
      </main>
    )
  }

  return (
    <>
      <AdminToolsNav />
      {children}
    </>
  )
}
