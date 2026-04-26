'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import AvatarColourSwatchGrid from '@/components/AvatarColourSwatchGrid'
import LetterAvatar from '@/components/LetterAvatar'
import {
  DEFAULT_AVATAR_COLOUR,
  isPaletteAvatarColour,
  normalizeAvatarLetter,
  resolveAvatarLetter,
} from '@/lib/letter-avatar'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'
import { repairUserProfileFromMetadataIfNeeded, type UserProfileRow } from '@/lib/user-profile-metadata'

const DISPLAY_MAX = 60
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [surname, setSurname] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [chosenLetter, setChosenLetter] = useState<string | null>(null)
  const [chosenColourHex, setChosenColourHex] = useState(DEFAULT_AVATAR_COLOUR)
  /** Preserved on save when set (e.g. `/admin-avatar.png`); not overwritten by letter/colour saves. */
  const [storedAvatarUrl, setStoredAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProfile = useCallback(async (uid: string) => {
    setLoading(true)
    setError('')
    const { data: authData } = await supabase.auth.getUser()
    const authed = authData.user
    if (!authed || authed.id !== uid) {
      setLoading(false)
      return
    }

    const { data, error: qErr } = await supabase
      .from('user_profiles')
      .select('first_name, surname, display_name, avatar_letter, avatar_colour, avatar_url')
      .eq('id', uid)
      .maybeSingle()

    if (qErr) {
      setError(qErr.message)
      setFirstName('')
      setSurname('')
      setDisplayName('')
      setChosenLetter(null)
      setChosenColourHex(DEFAULT_AVATAR_COLOUR)
      setStoredAvatarUrl(null)
      setLoading(false)
      return
    }

    let effective: UserProfileRow | null = (data as UserProfileRow | null) ?? null
    const { row: repaired, repaired: didRepair } = await repairUserProfileFromMetadataIfNeeded(
      supabase,
      authed,
      effective
    )
    if (didRepair && repaired) {
      effective = repaired
    }

    if (effective) {
      setStoredAvatarUrl(effective.avatar_url?.trim() || null)
      setFirstName(effective.first_name || '')
      setSurname(effective.surname || '')
      setDisplayName(effective.display_name || '')
      const col = effective.avatar_colour?.trim()
      if (col && /^#[0-9A-Fa-f]{6}$/.test(col)) {
        setChosenColourHex(`#${col.slice(1).toLowerCase()}`)
      } else {
        setChosenColourHex(DEFAULT_AVATAR_COLOUR)
      }
      setChosenLetter(normalizeAvatarLetter(effective.avatar_letter))
    } else {
      setStoredAvatarUrl(null)
      setFirstName('')
      setSurname('')
      setDisplayName('')
      setChosenLetter(null)
      setChosenColourHex(DEFAULT_AVATAR_COLOUR)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    trackEvent('page_view', 'profile')
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const u = session?.user ?? null
      setUser(u)
      setReady(true)
      if (u) void loadProfile(u.id)
      else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) void loadProfile(u.id)
      else {
        setDisplayName('')
        setChosenLetter(null)
        setChosenColourHex(DEFAULT_AVATAR_COLOUR)
        setStoredAvatarUrl(null)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    const name = displayName.trim()
    const first = firstName.trim()
    const last = surname.trim()
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
    if (!isPaletteAvatarColour(chosenColourHex)) {
      setError('Please choose a valid avatar colour.')
      return
    }
    const letterToSave = normalizeAvatarLetter(chosenLetter) ?? resolveAvatarLetter(null, first, name)
    if (!letterToSave || !/^[A-Z]$/.test(letterToSave)) {
      setError('Could not determine avatar letter.')
      return
    }

    setSaving(true)
    setMessage('')
    setError('')

    const colourNorm = `#${chosenColourHex.trim().slice(1).toLowerCase()}`
    const { error: upsertErr } = await supabase.from('user_profiles').upsert(
      {
        id: user.id,
        first_name: first,
        surname: last,
        display_name: name,
        avatar_letter: letterToSave,
        avatar_colour: colourNorm,
        avatar_url: storedAvatarUrl,
      },
      { onConflict: 'id' }
    )

    if (upsertErr) {
      setError(upsertErr.message)
      setSaving(false)
      return
    }

    setMessage('Profile saved.')
    setSaving(false)
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center text-sm text-gray-500">
        Loading…
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-4 text-gray-600">
          Sign up or log in to set your display name and avatar for Predict a Score leaderboards.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="inline-flex rounded-2xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Log in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10 md:py-14">
      <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
      <p className="mt-2 text-sm text-gray-600">
        This name and avatar appear on leaderboards and match banter. They are public to other players.
      </p>

      {loading ? (
        <p className="mt-10 text-sm text-gray-500">Loading profile…</p>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="first-name" className="mb-2 block text-sm font-medium text-gray-800">
                First name
              </label>
              <input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label htmlFor="surname" className="mb-2 block text-sm font-medium text-gray-800">
                Surname
              </label>
              <input
                id="surname"
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                required
                autoComplete="family-name"
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
              />
            </div>
          </div>
          <div>
            <label htmlFor="display-name" className="mb-2 block text-sm font-medium text-gray-800">
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_MAX}
              required
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
              placeholder="e.g. Schalk the Analyst"
            />
            <p className="mt-1 text-xs text-gray-400">{displayName.length}/{DISPLAY_MAX}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <span className="text-sm font-medium text-gray-800">Avatar preview</span>
            <div className="mt-3 flex justify-center">
              <LetterAvatar
                letter={chosenLetter}
                colour={chosenColourHex}
                avatarUrl={storedAvatarUrl}
                firstName={firstName}
                displayName={displayName}
                name={displayName.trim() || firstName.trim() || 'You'}
                size={96}
              />
            </div>
            {storedAvatarUrl ? (
              <p className="mt-2 text-center text-xs text-gray-600">
                A custom avatar image is set for your account. Saving keeps it along with your letter and colour
                settings. To use only the letter circle again, set avatar_url to null for your row in Supabase.
              </p>
            ) : (
              <p className="mt-2 text-center text-xs text-gray-500">
                Letter defaults to first of first name, then display name, if you clear your pick.
              </p>
            )}
          </div>

          <fieldset className="space-y-2 border-0 p-0">
            <legend className="mb-1.5 block text-sm font-medium text-gray-800">Avatar colour</legend>
            <p className="mb-2 text-xs text-gray-500">Pick a preset — custom hex colours are not available yet.</p>
            <AvatarColourSwatchGrid selectedHex={chosenColourHex} onSelect={setChosenColourHex} />
          </fieldset>

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-800">Avatar letter</span>
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

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-900">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-black px-6 py-4 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}

      <p className="mt-10 text-center text-sm text-gray-500">
        <Link href="/predict-score" className="text-black underline">
          Back to Predict a Score
        </Link>
      </p>
    </main>
  )
}
