'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { uploadPredictionAvatar } from '@/lib/prediction-avatar-upload'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

const DISPLAY_MAX = 60

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProfile = useCallback(async (uid: string) => {
    setLoading(true)
    setError('')
    const { data, error: qErr } = await supabase
      .from('user_profiles')
      .select('display_name, avatar_url')
      .eq('id', uid)
      .maybeSingle()

    if (qErr) {
      setError(qErr.message)
      setDisplayName('')
      setAvatarUrl(null)
    } else if (data) {
      setDisplayName((data as { display_name: string }).display_name || '')
      setAvatarUrl((data as { avatar_url: string | null }).avatar_url ?? null)
    } else {
      setDisplayName('')
      setAvatarUrl(null)
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
        setAvatarUrl(null)
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
    if (!name) {
      setError('Display name is required.')
      return
    }
    if (name.length > DISPLAY_MAX) {
      setError(`Display name must be ${DISPLAY_MAX} characters or fewer.`)
      return
    }

    setSaving(true)
    setMessage('')
    setError('')

    let nextAvatarUrl = avatarUrl

    if (file) {
      const { publicUrl, error: upErr } = await uploadPredictionAvatar(supabase, user.id, file)
      if (upErr) {
        setError(upErr.message)
        setSaving(false)
        return
      }
      nextAvatarUrl = publicUrl
      setAvatarUrl(publicUrl)
      setFile(null)
      const input = document.getElementById('profile-avatar-file') as HTMLInputElement | null
      if (input) input.value = ''
    }

    const { error: upsertErr } = await supabase.from('user_profiles').upsert(
      {
        id: user.id,
        display_name: name,
        avatar_url: nextAvatarUrl,
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
          Sign up or log in to set your display name and photo for Predict a Score leaderboards.
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
        This name and photo appear on leaderboards and match banter. They are public to other
        players.
      </p>

      {loading ? (
        <p className="mt-10 text-sm text-gray-500">Loading profile…</p>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="mt-8 space-y-6">
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

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-800">Profile picture</span>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-24 w-24 rounded-2xl border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                  No photo
                </div>
              )}
              <div className="w-full flex-1">
                <input
                  id="profile-avatar-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">PNG, JPEG, or WebP. Max 2 MB.</p>
              </div>
            </div>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
