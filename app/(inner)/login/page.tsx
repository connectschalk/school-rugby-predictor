'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin-email'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return
      const em = session.user.email?.toLowerCase() ?? ''
      if (em === ADMIN_EMAIL.toLowerCase()) router.replace('/admin')
      else router.replace('/profile')
    })
  }, [router])

  async function handleLogin(e: React.FormEvent) {
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

    setLoading(false)
    const em = data.user?.email?.toLowerCase() ?? ''
    if (em === ADMIN_EMAIL.toLowerCase()) {
      router.push('/admin')
    } else {
      router.push('/profile')
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-bold">Log in</h1>
        <p className="mt-2 text-gray-600">
          Sign in to predict scores, edit your profile, and see rankings. Admin accounts use the
          same page and are routed to the admin dashboard after login.
        </p>

        {resetSuccess ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Your password was updated. You can sign in below.
          </p>
        ) : null}

        <form
          onSubmit={handleLogin}
          className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm"
        >
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 text-center text-sm text-gray-600">
          <p>
            No account yet?{' '}
            <Link href="/signup" className="font-semibold text-black underline">
              Sign up
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="font-semibold text-black underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-sm text-gray-500">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
