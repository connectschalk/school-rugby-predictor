'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  DISPLAY_NAME_NOT_ALLOWED_MESSAGE,
  isDisplayNamePolicyDbError,
  validateDisplayName,
} from '@/lib/display-name-filter'
import { buildMemoryMapSignInHref, MEMORY_MAP_ACCOUNT_PATH } from '@/lib/memory-map/auth-routes'
import {
  ensureMemoryMapProfileExists,
  fetchMemoryMapProfile,
  updateMemoryMapProfile,
} from '@/lib/memory-map/user-profile'
import { supabase } from '@/lib/supabase'

const DISPLAY_MAX = 60

export default function MemoryMapAccountPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [contributorName, setContributorName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProfile = useCallback(async (authed: User) => {
    setLoading(true)
    setError('')
    await ensureMemoryMapProfileExists(supabase, authed)

    const { profile, error: fetchErr } = await fetchMemoryMapProfile(supabase, authed.id)
    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }

    setDisplayName(profile?.display_name?.trim() ?? '')
    setContributorName(profile?.contributor_name?.trim() ?? '')
    setAvatarUrl(profile?.avatar_url?.trim() ?? '')
    setLoading(false)
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const authed = session?.user ?? null
      setUser(authed)
      if (!authed) {
        setLoading(false)
        return
      }
      void loadProfile(authed)
    })
  }, [loadProfile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    setMessage('')
    setError('')

    const name = displayName.trim()
    const contributor = contributorName.trim()
    const avatar = avatarUrl.trim()

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
    if (contributor.length > DISPLAY_MAX) {
      setError(`Contributor name must be ${DISPLAY_MAX} characters or fewer.`)
      return
    }
    if (contributor) {
      const contributorCheck = validateDisplayName(contributor)
      if (!contributorCheck.ok) {
        setError(contributorCheck.message)
        return
      }
    }

    setSaving(true)
    const { error: saveErr } = await updateMemoryMapProfile(supabase, user.id, {
      display_name: name,
      contributor_name: contributor || name,
      avatar_url: avatar || null,
    })

    if (saveErr) {
      setError(
        isDisplayNamePolicyDbError(saveErr.message)
          ? DISPLAY_NAME_NOT_ALLOWED_MESSAGE
          : saveErr.message
      )
      setSaving(false)
      return
    }

    setMessage('Memory Map account saved.')
    setSaving(false)
    router.refresh()
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">NextPlay Memory Map</p>
        <h1 className="mt-3 text-2xl font-black">Account</h1>
        <p className="mm-muted mt-3 text-sm leading-relaxed">
          Sign in to manage your Memory Map display name and contributor settings.
        </p>
        <Link
          href={buildMemoryMapSignInHref(MEMORY_MAP_ACCOUNT_PATH)}
          className="mm-btn-primary mt-6 block rounded-2xl px-4 py-3 text-center text-sm font-black"
        >
          Sign in
        </Link>
        <Link href="/memory-map" className="mm-muted mt-4 block text-center text-sm font-bold underline underline-offset-4">
          Back to Memory Map
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">NextPlay Memory Map</p>
      <h1 className="mt-3 text-2xl font-black">Account</h1>
      <p className="mm-muted mt-2 text-sm leading-relaxed">
        These settings apply to Memory Map only. They do not change your Predictor profile or leaderboard name.
      </p>

      {loading ? (
        <p className="mm-muted mt-8 text-sm">Loading account…</p>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="mt-8 space-y-5">
          <div>
            <label htmlFor="mm-account-display-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
              Display name
            </label>
            <input
              id="mm-account-display-name"
              type="text"
              autoComplete="nickname"
              required
              maxLength={DISPLAY_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <p className="mm-muted mt-1 text-xs">Shown in the Memory Map menu and across Memory Map pages.</p>
          </div>

          <div>
            <label htmlFor="mm-account-contributor-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
              Contributor name
            </label>
            <input
              id="mm-account-contributor-name"
              type="text"
              autoComplete="off"
              maxLength={DISPLAY_MAX}
              value={contributorName}
              onChange={(e) => setContributorName(e.target.value)}
              className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <p className="mm-muted mt-1 text-xs">Default name when you add a story to a pin. Can differ from your display name.</p>
          </div>

          <div>
            <label htmlFor="mm-account-avatar-url" className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/70">
              Profile image URL <span className="font-normal normal-case text-white/50">(optional)</span>
            </label>
            <input
              id="mm-account-avatar-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
          </div>

          {user?.email ? (
            <p className="mm-muted text-xs">
              Signed in as <span className="text-white/90">{user.email}</span>
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      <Link href="/memory-map" className="mm-muted mt-6 block text-center text-sm font-bold underline underline-offset-4">
        Back to Memory Map
      </Link>
    </main>
  )
}
