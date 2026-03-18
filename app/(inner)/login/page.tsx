'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ALLOWED_ADMIN_EMAIL = 'connect.schalk@gmail.com'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState(ALLOWED_ADMIN_EMAIL)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session?.user?.email === ALLOWED_ADMIN_EMAIL) {
        router.push('/admin')
      }
    }

    checkSession()
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (data.user?.email !== ALLOWED_ADMIN_EMAIL) {
      await supabase.auth.signOut()
      setMessage('This account is not allowed to access admin.')
      setLoading(false)
      return
    }

    setLoading(false)
    router.push('/admin')
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-bold">Admin Login</h1>
        <p className="mt-2 text-gray-600">
          Sign in to access the admin area.
        </p>

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
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Log in'}
            </button>
          </div>
        </form>

        {message && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
            {message}
          </div>
        )}
      </div>
    </main>
  )
}