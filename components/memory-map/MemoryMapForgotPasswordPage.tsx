'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { safeMemoryMapReturnPath } from '@/lib/memory-map/auth-routes'
import { supabase } from '@/lib/supabase'
import MemoryMapAuthShell from '@/components/memory-map/MemoryMapAuthShell'

function ForgotPasswordFormInner() {
  const searchParams = useSearchParams()
  const returnPath = safeMemoryMapReturnPath(searchParams.get('next')) ?? '/memory-map'
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/update-password?next=${encodeURIComponent(returnPath)}`,
    })
    setLoading(false)
    if (resetErr) {
      setError(resetErr.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <MemoryMapAuthShell backHref={returnPath}>
        <h1 className="text-xl font-black">Check your email</h1>
        <p className="mm-muted mt-3 text-sm">If an account exists for {email.trim()}, you will receive a password reset link.</p>
      </MemoryMapAuthShell>
    )
  }

  return (
    <MemoryMapAuthShell backHref={returnPath}>
      <h1 className="text-xl font-black">Reset password</h1>
      <p className="mm-muted mt-2 text-sm">We will email you a link to choose a new password.</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="mm-forgot-email" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
            Email
          </label>
          <input
            id="mm-forgot-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={loading} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mm-muted mt-4 text-center text-sm">
        <Link href={`/memory-map/auth/sign-in?next=${encodeURIComponent(returnPath)}`} className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </MemoryMapAuthShell>
  )
}

export default function MemoryMapForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="mm-root px-5 py-10"><p className="mm-muted text-sm">Loading…</p></main>}>
      <ForgotPasswordFormInner />
    </Suspense>
  )
}
