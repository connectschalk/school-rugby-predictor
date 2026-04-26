'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import AvatarColourSwatchGrid from '@/components/AvatarColourSwatchGrid'
import LetterAvatar from '@/components/LetterAvatar'
import {
  DEFAULT_AVATAR_COLOUR,
  isPaletteAvatarColour,
  normalizeAvatarLetter,
  resolveAvatarLetter,
} from '@/lib/letter-avatar'
import {
  DISPLAY_NAME_NOT_ALLOWED_MESSAGE,
  isDisplayNamePolicyDbError,
  validateDisplayName,
} from '@/lib/display-name-filter'
import { supabase } from '@/lib/supabase'

const DISPLAY_MAX = 60
const PASSWORD_MIN = 8
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))

function SignupEmailConfirmModal({
  open,
  onDismiss,
  titleId,
}: {
  open: boolean
  onDismiss: () => void
  titleId: string
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-4 pt-4 safe-area-bottom sm:items-center sm:p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8"
      >
        <div className="border-l-4 border-red-600 pl-4">
          <h2 id={titleId} className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            Thank you for signing up
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">
            Check your email to confirm your account.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:flex-1"
          >
            Go to login
          </Link>
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 py-3 text-center text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:flex-1"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

function EmailConfirmReminderCard({ titleId }: { titleId: string }) {
  return (
    <div
      className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm sm:p-6"
      role="region"
      aria-labelledby={titleId}
    >
      <div className="border-l-4 border-red-600 pl-4">
        <h2 id={titleId} className="text-lg font-bold tracking-tight text-gray-900">
          Thank you for signing up
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Check your email to confirm your account.
        </p>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        After you confirm, sign in to finish your profile (including your avatar).
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:flex-1"
        >
          Go to login
        </Link>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:flex-1"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const emailConfirmTitleId = useId()
  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [chosenLetter, setChosenLetter] = useState<string | null>(null)
  const [chosenColourHex, setChosenColourHex] = useState(DEFAULT_AVATAR_COLOUR)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmailConfirm, setPendingEmailConfirm] = useState(false)
  const [emailConfirmModalOpen, setEmailConfirmModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace('/profile')
    })
  }, [router])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const first = firstName.trim()
    const last = surname.trim()
    const name = displayName.trim()
    if (!first) {
      setError('First name is required.')
      return
    }
    if (!last) {
      setError('Surname is required.')
      return
    }
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
    if (!isPaletteAvatarColour(chosenColourHex)) {
      setError('Please choose a valid avatar colour.')
      return
    }
    const letterToSave = normalizeAvatarLetter(chosenLetter) ?? resolveAvatarLetter(null, first, name)
    if (!letterToSave || !/^[A-Z]$/.test(letterToSave)) {
      setError('Could not determine avatar letter.')
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
    const colourNorm = `#${chosenColourHex.trim().slice(1).toLowerCase()}`
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        /**
         * Must be listed under Authentication → URL configuration → Redirect URLs.
         * Supabase confirm email uses {{ .ConfirmationURL }}; after verify, user is sent to this URL.
         */
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/login?confirmed=1')}`,
        data: {
          first_name: first,
          surname: last,
          display_name: name,
          full_name: `${first} ${last}`.trim(),
          avatar_letter: letterToSave,
          avatar_colour: colourNorm,
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
          first_name: first,
          surname: last,
          display_name: name,
          avatar_letter: letterToSave,
          avatar_colour: colourNorm,
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
      setLoading(false)
      router.push('/profile')
      return
    }

    if (data.user && !data.session) {
      setPendingEmailConfirm(true)
      setEmailConfirmModalOpen(true)
    }
    setLoading(false)
  }

  const dismissEmailModal = () => setEmailConfirmModalOpen(false)

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-center text-3xl font-bold tracking-tight">Create an account</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-gray-600">
        Join Predict a Score with your email. Your display name is what others see on leaderboards — not your email.
      </p>

      <form
        onSubmit={(e) => void handleSignup(e)}
        className="mt-8 space-y-4 rounded-2xl border border-gray-200 p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="signup-first-name" className="mb-2 block text-sm font-medium text-gray-800">
              First name
            </label>
            <input
              id="signup-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
          <div>
            <label htmlFor="signup-surname" className="mb-2 block text-sm font-medium text-gray-800">
              Surname
            </label>
            <input
              id="signup-surname"
              type="text"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              required
              autoComplete="family-name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
        </div>
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

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-900">Avatar preview</p>
          <div className="mt-3 flex justify-center">
            <LetterAvatar
              letter={chosenLetter}
              colour={chosenColourHex}
              firstName={firstName}
              displayName={displayName}
              name={displayName.trim() || firstName.trim() || 'You'}
              size={88}
            />
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            Letter {!chosenLetter ? `(default: first of first name, then display name)` : ''} · Colour
          </p>
        </div>

        <fieldset className="space-y-2 border-0 p-0">
          <legend className="mb-1.5 block text-sm font-medium text-gray-800">Avatar colour</legend>
          <p className="mb-2 text-xs text-gray-500">Pick a preset — custom hex colours are not available yet.</p>
          <AvatarColourSwatchGrid selectedHex={chosenColourHex} onSelect={setChosenColourHex} />
        </fieldset>

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-800">Avatar letter (optional)</span>
          <p className="mb-2 text-xs text-gray-500">
            If you skip this, we use the first letter of your first name, then display name.
          </p>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
            {LETTERS.map((L) => {
              const picked = chosenLetter === L
              return (
                <button
                  key={L}
                  type="button"
                  onClick={() => setChosenLetter(picked ? null : L)}
                  className={`rounded-lg border py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 ${
                    picked
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'
                  }`}
                  aria-pressed={picked}
                >
                  {L}
                </button>
              )
            })}
          </div>
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
      {pendingEmailConfirm && !emailConfirmModalOpen ? (
        <EmailConfirmReminderCard titleId={`${emailConfirmTitleId}-inline`} />
      ) : null}

      <SignupEmailConfirmModal
        open={emailConfirmModalOpen}
        onDismiss={dismissEmailModal}
        titleId={emailConfirmTitleId}
      />

      <p className="mt-8 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-black underline">
          Log in
        </Link>
      </p>
    </main>
  )
}
