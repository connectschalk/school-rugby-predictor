'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'

const AdvertisingInventoryPanel = dynamic(
  () => import('@/components/advertising/AdvertisingInventoryPanel'),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-slate-600">
        Loading advertising demo…
      </main>
    ),
  }
)

/**
 * Platform-admin only. Reuses the same admin gate as other /admin routes.
 * Do not weaken this check for demo convenience.
 */
export default function AdminAdvertisingDemoPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

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
      if (error || !isAdmin) {
        router.replace('/predict-score')
        return
      }
      setAuthChecked(true)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!session?.user) {
          router.replace('/login')
          return
        }
        const { isAdmin } = await fetchUserIsAdmin(supabase, session.user.id)
        if (!isAdmin) router.replace('/predict-score')
      })()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [router])

  if (!authChecked) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 text-gray-700">
        <p className="text-sm font-medium text-gray-800">Checking access…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <AdvertisingInventoryPanel />
    </main>
  )
}
