'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId, useState, Suspense } from 'react'
import LetterAvatar from '@/components/LetterAvatar'
import { clearPostConfirmProfilePreview, readPostConfirmProfilePreview, type PostConfirmProfilePreview } from '@/lib/user-profile-metadata'
import { supabase } from '@/lib/supabase'
import { isProfileAdminRole } from '@/lib/admin-access'

type PostLoginPath = '/admin' | '/profile' | '/predict-score'

/** First-time / incomplete profile → `/profile`; complete → `/predict-score`; admin role → `/admin`. Fetch errors → `/profile`. */
async function getPostLoginRouteForUser(user: {
  id: string
  email?: string | null
}): Promise<PostLoginPath> {
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('first_name, surname, display_name, role')
    .eq('id', user.id)
    .single()

  if (error || !profile) return '/profile'

  const row = profile as {
    first_name: string | null
    surname: string | null
    display_name: string | null
    role?: string | null
  }
  if (isProfileAdminRole(row.role)) return '/admin'

  const isProfileComplete =
    Boolean(row.first_name?.trim()) && Boolean(row.surname?.trim()) && Boolean(row.display_name?.trim())

  return isProfileComplete ? '/predict-score' : '/profile'
}

function AccountConfirmedModal({
  open,
  preview,
  onDismiss,
  onLogIn,
  titleId,
  hasSession,
  onContinueToApp,
}: {
  open: boolean
  preview: PostConfirmProfilePreview | null
  onDismiss: () => void
  onLogIn: () => void
  titleId: string
  hasSession: boolean
  onContinueToApp: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onDismiss])

  if (!open) return null

  const displayLabel =
    preview?.display_name?.trim() || preview?.first_name?.trim() || 'You'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#111318]/60 px-4 pt-4 safe-area-bottom sm:items-center sm:p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[min(100%,22rem)] rounded-3xl border border-gray-200/90 bg-white p-7 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.28)] ring-1 ring-black/5 sm:max-w-md sm:p-9"
      >
        <div className="flex flex-col items-center text-center">
          <Image
            src="/nextplay-predictor.png"
            alt="School Rugby Predictor — NextPlay Predictor"
            width={168}
            height={56}
            className="h-11 w-auto"
            priority
          />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            School Rugby Predictor
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <LetterAvatar
            letter={preview?.avatar_letter}
            colour={preview?.avatar_colour}
            firstName={preview?.first_name}
            displayName={preview?.display_name}
            name={displayLabel}
            size={88}
            className="shadow-lg shadow-black/15 ring-2 ring-gray-900/10"
          />
        </div>

        <div className="mt-8 border-l-4 border-red-600 pl-4 text-left">
          <h2 id={titleId} className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            Account confirmed
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-[15px] sm:leading-relaxed">
            Thank you for signing up. Your profile is ready. Log in to start predicting.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => (hasSession ? onContinueToApp() : onLogIn())}
            className="w-full rounded-2xl bg-black px-5 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Log in
          </button>
          <Link
            href="/"
            onClick={() => clearPostConfirmProfilePreview()}
            className="flex w-full items-center justify-center rounded-2xl border-2 border-gray-300 bg-white px-5 py-3.5 text-sm font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const confirmedTitleId = useId()
  const resetSuccess = searchParams.get('reset') === 'success'
  const confirmed = searchParams.get('confirmed') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmedModalOpen, setConfirmedModalOpen] = useState(confirmed)
  const [hasSession, setHasSession] = useState(false)
  const [confirmPreview, setConfirmPreview] = useState<PostConfirmProfilePreview | null>(null)
  const [sessionRedirecting, setSessionRedirecting] = useState(false)

  useEffect(() => {
    setConfirmedModalOpen(confirmed)
  }, [confirmed])

  useEffect(() => {
    if (confirmed && confirmedModalOpen) {
      setConfirmPreview(readPostConfirmProfilePreview())
    }
  }, [confirmed, confirmedModalOpen])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session?.user)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user || cancelled || confirmed) return
      setSessionRedirecting(true)
      const path = await getPostLoginRouteForUser(session.user)
      if (!cancelled) router.replace(path)
    })()
    return () => {
      cancelled = true
    }
  }, [router, confirmed])

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

    clearPostConfirmProfilePreview()

    const user = data.user
    if (!user) {
      setError('Could not load your account.')
      setLoading(false)
      return
    }

    try {
      const path = await getPostLoginRouteForUser(user)
      router.push(path)
    } catch {
      setError('Could not verify your profile. Try again.')
      setLoading(false)
    }
  }

  const continueToApp = () => {
    clearPostConfirmProfilePreview()
    setConfirmedModalOpen(false)
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) return
      const path = await getPostLoginRouteForUser(session.user)
      router.replace(path)
    })()
  }

  const dismissConfirmedModal = () => {
    clearPostConfirmProfilePreview()
    setConfirmedModalOpen(false)
    if (confirmed) router.replace('/login')
  }

  const logInFromConfirmedModal = () => {
    clearPostConfirmProfilePreview()
    setConfirmedModalOpen(false)
    if (confirmed) router.replace('/login')
    window.requestAnimationFrame(() => {
      document.getElementById('login-email')?.focus()
    })
  }

  return (
    <main className="relative min-h-screen bg-white text-black">
      {sessionRedirecting ? (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-white/95 text-gray-700"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" aria-hidden />
          <p className="text-sm font-medium text-gray-800">Signing you in…</p>
        </div>
      ) : null}
      <AccountConfirmedModal
        open={confirmedModalOpen}
        preview={confirmPreview}
        onDismiss={dismissConfirmedModal}
        onLogIn={logInFromConfirmedModal}
        titleId={confirmedTitleId}
        hasSession={hasSession}
        onContinueToApp={continueToApp}
      />
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
          id="login-form"
          onSubmit={handleLogin}
          className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm"
        >
          <div className="grid gap-4">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium">
                Email
              </label>
              <input
                id="login-email"
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
              className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-60"
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
