'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import {
  buildMemoryMapSignInHref,
  resolveMemoryMapPostAuthRedirect,
  safeMemoryMapReturnPath,
} from '@/lib/memory-map/auth-routes'
import { supabase } from '@/lib/supabase'

const PASSWORD_MIN = 8

function CreatePasswordFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextAfterPassword = safeMemoryMapReturnPath(searchParams.get('next'))

  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(Boolean(session?.user))
      setReady(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateErr) {
      setError(updateErr.message)
      return
    }

    router.push(resolveMemoryMapPostAuthRedirect(nextAfterPassword))
  }

  const returnPath = nextAfterPassword ?? '/memory-map'

  if (!ready) {
    return <p className="mm-muted text-sm">Loading…</p>
  }

  if (!hasSession) {
    return (
      <>
        <h1 className="text-xl font-black">Create your password</h1>
        <p className="mm-muted mt-3 text-sm leading-relaxed">
          Open the verification link from your email again, or return to your invite link to start over.
        </p>
        <Link
          href={returnPath}
          className="mm-btn-primary mt-6 block rounded-2xl px-4 py-3 text-center text-sm font-black"
        >
          Back
        </Link>
        <Link
          href={buildMemoryMapSignInHref(returnPath)}
          className="mm-btn-secondary mt-3 block rounded-2xl px-4 py-3 text-center text-sm font-bold"
        >
          Sign in instead
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-black">Create your password</h1>
      <p className="mm-muted mt-2 text-sm leading-relaxed">
        Choose a password to finish setting up your Memory Map account.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="mm-create-password" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Password
          </label>
          <input
            id="mm-create-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="mm-create-password-confirm" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Confirm password
          </label>
          <input
            id="mm-create-password-confirm"
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
          {loading ? 'Saving…' : 'Save password and continue'}
        </button>
      </form>
    </>
  )
}

export default function MemoryMapCreatePasswordForm() {
  return (
    <Suspense fallback={<p className="mm-muted text-sm">Loading…</p>}>
      <CreatePasswordFormInner />
    </Suspense>
  )
}
