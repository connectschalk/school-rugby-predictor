'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signupProductMetadata } from '@/lib/auth-email'
import {
  buildMemoryMapSignInHref,
} from '@/lib/memory-map/auth-routes'
import {
  acceptOrganisationAdminInvite,
  organisationAdminInvitePath,
  organisationDashboardPath,
  type OrganisationInviteLookup,
} from '@/lib/memory-map/organisations'
import { ensureMemoryMapProfileExists } from '@/lib/memory-map/user-profile'
import { supabase } from '@/lib/supabase'

const PASSWORD_MIN = 8

type Props = {
  token: string
  invite: OrganisationInviteLookup
}

export default function OrganisationAdminInviteClient({ token, invite }: Props) {
  const router = useRouter()
  const returnPath = organisationAdminInvitePath(token)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [organisationSlug, setOrganisationSlug] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionEmail(session?.user?.email?.toLowerCase() ?? null)
    })
  }, [])

  const inviteEmail = invite.email.toLowerCase()
  const emailMatches = sessionEmail === inviteEmail
  const isAccepted = invite.status === 'accepted'
  const isInvalid = invite.status === 'revoked' || invite.status === 'expired'

  async function acceptInvite() {
    setError('')
    setBusy(true)
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      await ensureMemoryMapProfileExists(supabase, userData.user, {
        displayName: invite.invitedDisplayName ?? undefined,
        contributorName: invite.invitedDisplayName ?? undefined,
      })
    }
    const result = await acceptOrganisationAdminInvite(supabase, token)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setOrganisationSlug(result.organisationSlug)
    setDone(true)
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { data, error: signErr } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
          `/memory-map/auth/sign-in?next=${encodeURIComponent(returnPath)}`
        )}`,
        data: {
          ...signupProductMetadata('memory_map'),
          memory_map_display_name: invite.invitedDisplayName ?? invite.email.split('@')[0],
          memory_map_contributor_name: invite.invitedDisplayName ?? invite.email.split('@')[0],
        },
      },
    })

    if (signErr) {
      setError(signErr.message)
      setBusy(false)
      return
    }

    if (data.session && data.user) {
      await ensureMemoryMapProfileExists(supabase, data.user, {
        displayName: invite.invitedDisplayName ?? undefined,
        contributorName: invite.invitedDisplayName ?? undefined,
      })
      await acceptInvite()
      return
    }

    setBusy(false)
    setError('Check your email to confirm your account, then sign in to accept this invite.')
  }

  if (isInvalid) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <h1 className="text-2xl font-black">Invite not available</h1>
        <p className="mm-muted mt-3 text-sm">
          This invite is {invite.status}. Ask a platform admin to send a new invite.
        </p>
        <Link href="/memory-map" className="mm-btn-secondary mt-6 block rounded-xl py-3 text-center text-sm font-bold">
          Back to Memory Map
        </Link>
      </main>
    )
  }

  if (isAccepted || done) {
    const slug = organisationSlug ?? invite.organisationSlug
    const href = organisationDashboardPath(slug)
    return (
      <main className="mx-auto max-w-lg px-5 py-10">
        <h1 className="text-2xl font-black">You&apos;re an organisation admin</h1>
        <p className="mm-muted mt-3 text-sm">
          You can now manage <strong className="text-white">{invite.organisationName}</strong> on NextPlay Memory Map.
        </p>
        <Link href={href} className="mm-btn-primary mt-6 block rounded-xl py-3 text-center text-sm font-black">
          Open organisation dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">NextPlay Memory Map</p>
      <h1 className="mt-3 text-2xl font-black">Organisation admin invite</h1>
      <p className="mm-muted mt-3 text-sm leading-relaxed">
        You have been invited to help manage <strong className="text-white">{invite.organisationName}</strong> on
        NextPlay Memory Map. Create your password or sign in to accept.
      </p>
      <p className="mt-3 text-sm">
        Invited email: <span className="font-bold text-white">{invite.email}</span>
      </p>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      {sessionEmail && !emailMatches ? (
        <div className="mm-card mt-6 rounded-xl p-4 text-sm">
          <p className="font-bold">Wrong account</p>
          <p className="mm-muted mt-1">
            You are signed in as {sessionEmail}. Sign out and use {invite.email} to accept this invite.
          </p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut().then(() => router.refresh())}
            className="mm-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            Sign out
          </button>
        </div>
      ) : null}

      {sessionEmail && emailMatches ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void acceptInvite()}
          className="mm-btn-primary mt-6 w-full rounded-xl py-3 text-sm font-black disabled:opacity-50"
        >
          {busy ? 'Accepting…' : 'Accept invite'}
        </button>
      ) : !sessionEmail ? (
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-sm font-black">Create your password</h2>
            <p className="mm-muted mt-1 text-xs">For new Memory Map accounts at this email address.</p>
            <form onSubmit={(e) => void onSignUp(e)} className="mt-3 space-y-3">
              <input
                type="email"
                value={invite.email}
                readOnly
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm opacity-80"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
              />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
              />
              <button type="submit" disabled={busy} className="mm-btn-primary w-full rounded-xl py-3 text-sm font-black disabled:opacity-50">
                {busy ? 'Creating account…' : 'Create password and accept invite'}
              </button>
            </form>
          </section>
          <section>
            <h2 className="text-sm font-black">Already have an account?</h2>
            <Link
              href={buildMemoryMapSignInHref(returnPath)}
              className="mm-btn-secondary mt-3 block rounded-xl py-3 text-center text-sm font-bold"
            >
              Sign in to accept invite
            </Link>
          </section>
        </div>
      ) : null}
    </main>
  )
}
