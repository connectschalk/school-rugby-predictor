'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import {
  DISPLAY_NAME_NOT_ALLOWED_MESSAGE,
  isDisplayNamePolicyDbError,
  validateDisplayName,
} from '@/lib/display-name-filter'
import { signupProductMetadata } from '@/lib/auth-email'
import { buildMemoryMapEmailConfirmCallbackUrl } from '@/lib/auth-redirect'
import { createSignupPlaceholderPassword } from '@/lib/auth-signup-placeholder'
import { ensureMemoryMapProfileExists } from '@/lib/memory-map/user-profile'
import {
  buildMemoryMapSignInHref,
  resolveMemoryMapPostAuthRedirect,
  safeMemoryMapReturnPath,
} from '@/lib/memory-map/auth-routes'
import { supabase } from '@/lib/supabase'

const DISPLAY_MAX = 60

function SignUpFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextAfterSignup = safeMemoryMapReturnPath(searchParams.get('next'))

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
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

    setLoading(true)
    const returnPath = nextAfterSignup ?? '/memory-map'

    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password: createSignupPlaceholderPassword(),
      options: {
        emailRedirectTo: buildMemoryMapEmailConfirmCallbackUrl(returnPath),
        data: {
          ...signupProductMetadata('memory_map'),
          display_name: name,
          full_name: name,
          memory_map_display_name: name,
          memory_map_contributor_name: name,
        },
      },
    })

    if (signErr) {
      setError(signErr.message)
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      const { error: profErr } = await ensureMemoryMapProfileExists(supabase, data.user, {
        displayName: name,
        contributorName: name,
      })
      if (profErr) {
        setError(
          isDisplayNamePolicyDbError(profErr.message)
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
          We sent a confirmation link to <span className="text-white">{email.trim()}</span>. After you verify your
          email, you&apos;ll choose a password to finish setting up your Memory Map account.
        </p>
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
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={loading} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
          {loading ? 'Sending verification…' : 'Send verification email'}
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
