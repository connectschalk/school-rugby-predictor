'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PASSWORD_MIN = 8
const RECOVERY_WAIT_MS = 10000

export default function AuthUpdatePasswordPage() {
  const router = useRouter()
  const [recovery, setRecovery] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let waitId: number | undefined
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true)
        if (waitId !== undefined) {
          window.clearTimeout(waitId)
          waitId = undefined
        }
      }
    })

    waitId = window.setTimeout(() => {
      setTimedOut(true)
      waitId = undefined
    }, RECOVERY_WAIT_MS)

    return () => {
      subscription.unsubscribe()
      if (waitId !== undefined) window.clearTimeout(waitId)
    }
  }, [])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error: upErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setMessage('Password updated. You can sign in with your new password.')
    window.setTimeout(() => router.push('/login?reset=success'), 1500)
  }

  if (!recovery && timedOut) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Reset link</h1>
        <p className="mt-4 text-sm text-gray-600">
          This page is opened from the password reset email. If you did not arrive from a reset
          link, request a new one below.
        </p>
        <Link
          href="/forgot-password"
          className="mt-8 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:opacity-90"
        >
          Forgot password
        </Link>
        <p className="mt-6">
          <Link href="/login" className="text-sm text-gray-600 underline">
            Log in
          </Link>
        </p>
      </main>
    )
  }

  if (!recovery) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
        Verifying reset link…
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-sm text-gray-600">Enter your new password twice to confirm.</p>

      <form
        onSubmit={(e) => void handleUpdate(e)}
        className="mt-8 space-y-4 rounded-2xl border border-gray-200 p-6 shadow-sm"
      >
        <div>
          <label htmlFor="new-pw" className="mb-2 block text-sm font-medium text-gray-800">
            New password
          </label>
          <input
            id="new-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
        <div>
          <label htmlFor="new-pw2" className="mb-2 block text-sm font-medium text-gray-800">
            Confirm new password
          </label>
          <input
            id="new-pw2"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
    </main>
  )
}
