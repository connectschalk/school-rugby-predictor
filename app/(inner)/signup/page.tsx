'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DISPLAY_MAX = 60
const PASSWORD_MIN = 8

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace('/profile')
    })
  }, [router])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const name = displayName.trim()
    if (!name) {
      setError('Display name is required.')
      return
    }
    if (name.length > DISPLAY_MAX) {
      setError(`Display name must be ${DISPLAY_MAX} characters or fewer.`)
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
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${origin}/profile`,
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
        setError(profErr.message)
        setLoading(false)
        return
      }
      setLoading(false)
      router.push('/profile')
      return
    }

    if (data.user) {
      setMessage(
        'Check your email to confirm your account. After confirming, sign in — your display name is saved on your account and you can finish your profile anytime.'
      )
    }
    setLoading(false)
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-2 text-sm text-gray-600">
        Join Predict a Score with your email. Your display name is what others see on
        leaderboards — not your email.
      </p>

      <form
        onSubmit={(e) => void handleSignup(e)}
        className="mt-8 space-y-4 rounded-2xl border border-gray-200 p-6 shadow-sm"
      >
        <div>
          <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-gray-800">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
        <div>
          <label htmlFor="signup-display" className="mb-2 block text-sm font-medium text-gray-800">
            Display name
          </label>
          <input
            id="signup-display"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={DISPLAY_MAX}
            autoComplete="nickname"
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
            placeholder="How you appear on rankings"
          />
          <p className="mt-1 text-xs text-gray-400">{displayName.length}/{DISPLAY_MAX}</p>
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-gray-800">
            Password
          </label>
          <input
            id="signup-password"
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
          <label htmlFor="signup-confirm" className="mb-2 block text-sm font-medium text-gray-800">
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {message}
        </div>
      ) : null}

      <p className="mt-8 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-black underline">
          Log in
        </Link>
      </p>
    </main>
  )
}
