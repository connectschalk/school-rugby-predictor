'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import { buildPoolJoinPath, isUuid, POOL_INVITE_FROM_PARAM } from '@/lib/pool-invite-path'
import {
  fetchPoolByInviteToken,
  fetchPoolInviteViewerState,
  requestJoinPool,
  type PoolInvitePreview,
  type PoolInviteViewerState,
} from '@/lib/pools'
import { supabase } from '@/lib/supabase'

function inviterSubtitle(pool: PoolInvitePreview): string {
  if (pool.inviter_kind === 'anonymous') {
    return 'You were invited by a pool admin.'
  }
  const n = pool.inviter_display_name?.trim()
  if (pool.inviter_kind === 'sharer' && !n) {
    return 'You were invited by a pool member.'
  }
  if (n) return `Invited by ${n}`
  return 'You were invited by a pool admin.'
}

export default function PoolInviteLanding({ inviteToken }: { inviteToken: string }) {
  const searchParams = useSearchParams()
  const fromRaw = searchParams.get(POOL_INVITE_FROM_PARAM)?.trim() ?? ''
  const invitedByParam = isUuid(fromRaw) ? fromRaw : null

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [pool, setPool] = useState<PoolInvitePreview | null>(null)
  const [viewerState, setViewerState] = useState<PoolInviteViewerState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingPool, setLoadingPool] = useState(true)
  const [loadingState, setLoadingState] = useState(false)
  const [requestBusy, setRequestBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [requestErr, setRequestErr] = useState('')

  const token = inviteToken.trim()
  const returnPath = useMemo(() => buildPoolJoinPath(token, invitedByParam), [token, invitedByParam])
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(returnPath)}`

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadPool = useCallback(async () => {
    if (!token) return
    setLoadingPool(true)
    setLoadError('')
    const { pool: p, error } = await fetchPoolByInviteToken(supabase, token, invitedByParam)
    setLoadingPool(false)
    if (error) {
      setLoadError(error.message)
      setPool(null)
      return
    }
    setPool(p)
    if (!p) {
      setLoadError('')
    }
  }, [token, invitedByParam])

  const loadViewerState = useCallback(async () => {
    if (!token || !user) {
      setViewerState(null)
      return
    }
    setLoadingState(true)
    const { state, error } = await fetchPoolInviteViewerState(supabase, token)
    setLoadingState(false)
    if (error) {
      setViewerState(null)
      return
    }
    setViewerState(state)
  }, [token, user])

  useEffect(() => {
    void loadPool()
  }, [loadPool])

  useEffect(() => {
    void loadViewerState()
  }, [loadViewerState])

  async function onRequestJoin() {
    if (!pool) return
    setRequestBusy(true)
    setRequestErr('')
    setSuccessMsg('')
    const { error } = await requestJoinPool(supabase, pool.id, token)
    setRequestBusy(false)
    if (error) {
      setRequestErr(error.message)
      return
    }
    setSuccessMsg('Request sent. The pool admin will approve your access.')
    void loadViewerState()
  }

  if (!authReady) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <InviteShell>
          <h1 className="text-xl font-black tracking-tight text-gray-900">Invite link</h1>
          <p className="mt-4 text-sm text-gray-700">This invite link is no longer valid.</p>
          <BackToPools className="mt-8" />
        </InviteShell>
      </main>
    )
  }

  if (loadingPool) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <p className="text-sm text-gray-500">Loading invite…</p>
      </main>
    )
  }

  if (loadError || !pool) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 md:px-6">
        <InviteShell>
          <h1 className="text-xl font-black tracking-tight text-gray-900">Invite link</h1>
          <p className="mt-4 text-sm text-gray-700">This invite link is no longer valid.</p>
          <BackToPools className="mt-8" />
        </InviteShell>
      </main>
    )
  }

  const inviterLine = inviterSubtitle(pool)
  const showInviterAvatar =
    pool.inviter_avatar_url != null ||
    pool.inviter_avatar_letter != null ||
    pool.inviter_avatar_colour != null

  return (
    <main className="mx-auto max-w-lg px-4 py-10 md:px-6 md:py-14">
      <InviteShell>
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">Pool invite</p>
        <h1 className="mt-3 text-center text-2xl font-black leading-tight tracking-tight text-gray-900 md:text-3xl">
          You’ve been invited to join a prediction pool
        </h1>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-5 text-center">
          <p className="text-lg font-bold text-gray-900">{pool.name}</p>
          <p className="mt-3 text-sm text-gray-700">{inviterLine}</p>
          {showInviterAvatar ? (
            <div className="mt-4 flex justify-center">
              <LetterAvatar
                letter={pool.inviter_avatar_letter}
                colour={pool.inviter_avatar_colour}
                avatarUrl={pool.inviter_avatar_url}
                displayName={pool.inviter_display_name ?? 'Inviter'}
                name={pool.inviter_display_name ?? 'Inviter'}
                size={56}
                className="ring-2 ring-white shadow-md"
              />
            </div>
          ) : null}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-gray-600">
          Pools are private prediction groups where members compete on match predictions and pool-only
          leaderboards.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-gray-700">
          <li>Join the pool</li>
          <li>Predict weekly school rugby scores</li>
          <li>Compete on the private leaderboard</li>
        </ul>

        <p
          className={`mt-5 rounded-xl px-3 py-2.5 text-sm ${
            !pool.is_public
              ? 'border border-amber-200 bg-amber-50 text-amber-950'
              : 'border border-gray-200 bg-gray-50 text-gray-800'
          }`}
        >
          {!pool.is_public
            ? 'This pool is private. Your request will be sent to the pool admin for approval.'
            : 'Request to join — the pool admin approves new members.'}
        </p>

        <details className="mt-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-gray-900">How pools work</summary>
          <p className="mt-3 text-gray-600">
            A pool admin picks fixture groups and invites members. You predict scores on the same games as
            the rest of the pool. Only members see private pool leaderboards and pool picks; your global
            predictions still work on the main Predict page.
          </p>
        </details>

        <div className="mt-8 border-t border-gray-100 pt-6">
          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                You need an account so we can save your predictions and add you to the pool.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={loginHref}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  Log in to join
                </Link>
                <Link
                  href={signupHref}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : loadingState ? (
            <p className="text-sm text-gray-500">Checking your membership…</p>
          ) : viewerState?.is_member ? (
            <div className="space-y-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">You’re already in this pool.</p>
              <Link
                href="/pools"
                className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
              >
                Go to pool
              </Link>
            </div>
          ) : successMsg ? (
            <p className="text-center text-sm font-medium text-emerald-800">{successMsg}</p>
          ) : viewerState?.has_pending_request ? (
            <p className="text-center text-sm text-gray-700">
              You already have a pending request. The pool admin will approve your access.
            </p>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={requestBusy}
                onClick={() => void onRequestJoin()}
                className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                {requestBusy ? 'Sending…' : 'Request to join pool'}
              </button>
              {requestErr ? <p className="text-center text-sm text-red-800">{requestErr}</p> : null}
            </div>
          )}
        </div>

        <BackToPools className="mt-10" />
      </InviteShell>
    </main>
  )
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-lg shadow-black/10 md:p-8">
      {children}
    </div>
  )
}

function BackToPools({ className = '' }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <Link
        href="/pools"
        className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
      >
        Back to Pools
      </Link>
    </div>
  )
}
