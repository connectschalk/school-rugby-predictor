'use client'

/**
 * Email confirmation landing (PKCE `?code=` or implicit hash session).
 *
 * Supabase "Confirm signup" email must keep the built-in link as {{ .ConfirmationURL }}.
 * Product-specific copy/branding is set in Supabase email templates using `.Data.signup_product`
 * (see `supabase/email-templates/confirm-signup.md`).
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isMemoryMapSignup } from '@/lib/auth-email'
import { upsertMemoryMapProfileFromSignupMetadata } from '@/lib/memory-map/user-profile'
import { supabase } from '@/lib/supabase'
import { stashPostConfirmProfilePreview, upsertProfileFromSignupMetadata } from '@/lib/user-profile-metadata'

function safeLoginConfirmedPath(nextParam: string | null): string {
  const fallback = '/login?confirmed=1'
  if (!nextParam) return fallback
  try {
    const decoded = decodeURIComponent(nextParam)
    if (decoded.startsWith('/login')) return decoded.includes('confirmed=') ? decoded : `${decoded}${decoded.includes('?') ? '&' : '?'}confirmed=1`
  } catch {
    /* ignore */
  }
  return fallback
}

async function syncProfileAfterEmailConfirm(user: import('@supabase/supabase-js').User): Promise<Error | null> {
  if (isMemoryMapSignup(user)) {
    const { error } = await upsertMemoryMapProfileFromSignupMetadata(supabase, user)
    return error
  }
  const { error } = await upsertProfileFromSignupMetadata(supabase, user)
  return error
}

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ran = useRef(false)
  const [hint, setHint] = useState('Confirming your account…')

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const dest = safeLoginConfirmedPath(searchParams.get('next'))

    const finish = async () => {
      if (searchParams.get('error')) {
        router.replace('/login')
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error || !data.session?.user) {
          router.replace('/login')
          return
        }
        const upErr = await syncProfileAfterEmailConfirm(data.session.user)
        if (upErr) {
          console.error('[auth/callback] profile upsert:', upErr.message)
        }
        if (!isMemoryMapSignup(data.session.user)) {
          stashPostConfirmProfilePreview(data.session.user)
        }
        await supabase.auth.signOut()
        router.replace(dest)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) {
        setHint('Saving your profile…')
        const upErr = await syncProfileAfterEmailConfirm(session.user)
        if (upErr) {
          console.error('[auth/callback] profile upsert:', upErr.message)
        }
        if (!isMemoryMapSignup(session.user)) {
          stashPostConfirmProfilePreview(session.user)
        }
        await supabase.auth.signOut()
        router.replace(dest)
        return
      }

      router.replace('/login')
    }

    void finish()
  }, [router, searchParams])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#111318] px-6 text-center text-white">
      <p className="text-sm font-medium text-gray-300">{hint}</p>
    </main>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#111318] text-sm text-gray-400">
          Loading…
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  )
}
