'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ensureUserProfileExists } from '@/lib/user-profile-metadata'
import {
  buildMemoryMapSignUpHref,
  resolveMemoryMapPostAuthRedirect,
  safeMemoryMapReturnPath,
} from '@/lib/memory-map/auth-routes'
import { supabase } from '@/lib/supabase'

function SignInFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextAfterLogin = safeMemoryMapReturnPath(searchParams.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace(resolveMemoryMapPostAuthRedirect(nextAfterLogin))
      }
    })
  }, [router, nextAfterLogin])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signErr) {
      setError(signErr.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await ensureUserProfileExists(supabase, data.user)
    }

    router.push(resolveMemoryMapPostAuthRedirect(nextAfterLogin))
  }

  const returnPath = nextAfterLogin ?? '/memory-map'

  return (
    <>
      <h1 className="text-xl font-black">Sign in</h1>
      <p className="mm-muted mt-2 text-sm">Use your NextPlay account to add memories or manage maps.</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="mm-sign-in-email" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Email
          </label>
          <input
            id="mm-sign-in-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mm-sign-in-password" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Password
          </label>
          <input
            id="mm-sign-in-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={loading} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mm-muted mt-4 text-center text-sm">
        <Link href={buildMemoryMapSignUpHref(returnPath)} className="font-bold text-white underline underline-offset-4">
          Create account
        </Link>
      </p>
      <p className="mm-muted mt-2 text-center text-xs">
        <Link href={`/memory-map/auth/forgot-password?next=${encodeURIComponent(returnPath)}`} className="underline underline-offset-4">
          Forgot password?
        </Link>
      </p>
    </>
  )
}

export default function MemoryMapSignInForm() {
  return (
    <Suspense fallback={<p className="mm-muted text-sm">Loading…</p>}>
      <SignInFormInner />
    </Suspense>
  )
}
