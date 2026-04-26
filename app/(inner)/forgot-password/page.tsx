'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/update-password`,
    })
    setLoading(false)
    if (resetErr) {
      setError(resetErr.message)
      return
    }
    setMessage(
      'If an account exists for that email, you will receive a reset link shortly. Check your inbox and spam folder.'
    )
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter the email you signed up with. We will send a link to choose a new password.
      </p>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-8 space-y-4 rounded-2xl border border-gray-200 p-6 shadow-sm"
      >
        <div>
          <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-gray-800">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
          {message}
        </div>
      ) : null}

      <p className="mt-8 text-center text-sm text-gray-600">
        <Link href="/login" className="font-semibold text-black underline">
          Back to log in
        </Link>
      </p>
    </main>
  )
}
