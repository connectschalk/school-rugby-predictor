'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import {
  DISPLAY_NAME_NOT_ALLOWED_MESSAGE,
  isDisplayNamePolicyDbError,
  validateDisplayName,
} from '@/lib/display-name-filter'
import {
  buildMemoryMapSignInHref,
  resolveMemoryMapPostAuthRedirect,
  safeMemoryMapReturnPath,
} from '@/lib/memory-map/auth-routes'
import { supabase } from '@/lib/supabase'

const PASSWORD_MIN = 8
const DISPLAY_MAX = 60

function SignUpFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextAfterSignup = safeMemoryMapReturnPath(searchParams.get('next'))

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailConfirmSent, setEmailConfirmSent] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace(resolveMemoryMapPostAuthRedirect(nextAfterSignup))
      }
    })
  }, [router, nextAfterSignup])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const name = displayName.trim()
    if (!name) {
      setError('Display name is required.')
      return
    }
    if (name.length > DISPLAY_MAX) {
      setError(`Display name must be ${DISPLAY_MAX} characters or fewer.`)
      return
    }
    const displayCheck = validateDisplayName(name)
    if (!displayCheck.ok) {
      setError(displayCheck.message)
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const returnPath = nextAfterSignup ?? '/memory-map'

    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(`/memory-map/auth/sign-in?next=${encodeURIComponent(returnPath)}`)}`,
        data: {
          display_name: name,
          full_name: name,
        },
      },
    })

    if (signErr) {
      setError(signErr.message)
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      const { error: profErr } = await supabase.from('user_profiles').upsert(
        {
          id: data.user.id,
          display_name: name,
          avatar_url: null,
        },
        { onConflict: 'id' }
      )
      if (profErr) {
        setError(
          profErr.code === '23514' || isDisplayNamePolicyDbError(profErr.message)
            ? DISPLAY_NAME_NOT_ALLOWED_MESSAGE
            : profErr.message
        )
        setLoading(false)
        return
      }
      router.push(resolveMemoryMapPostAuthRedirect(nextAfterSignup))
      return
    }

    setEmailConfirmSent(true)
    setLoading(false)
  }

  const returnPath = nextAfterSignup ?? '/memory-map'

  if (emailConfirmSent) {
    return (
      <>
        <h1 className="text-xl font-black">Check your email</h1>
        <p className="mm-muted mt-3 text-sm leading-relaxed">
          We sent a confirmation link to <span className="text-white">{email.trim()}</span>. Confirm your account, then sign in to continue.
        </p>
        <Link
          href={buildMemoryMapSignInHref(returnPath)}
          className="mm-btn-primary mt-6 block rounded-2xl px-4 py-3 text-center text-sm font-black"
        >
          Go to sign in
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-black">Create account</h1>
      <p className="mm-muted mt-2 text-sm">One NextPlay account works across Predictor and Memory Map.</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="mm-sign-up-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Display name
          </label>
          <input
            id="mm-sign-up-name"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mm-sign-up-email" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Email
          </label>
          <input
            id="mm-sign-up-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mm-sign-up-password" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Password
          </label>
          <input
            id="mm-sign-up-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mm-sign-up-confirm" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Confirm password
          </label>
          <input
            id="mm-sign-up-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={loading} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mm-muted mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link href={buildMemoryMapSignInHref(returnPath)} className="font-bold text-white underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  )
}

export default function MemoryMapSignUpForm() {
  return (
    <Suspense fallback={<p className="mm-muted text-sm">Loading…</p>}>
      <SignUpFormInner />
    </Suspense>
  )
}
