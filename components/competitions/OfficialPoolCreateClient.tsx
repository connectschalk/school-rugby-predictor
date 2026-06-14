'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { competitionCardTitle, type Competition } from '@/lib/competitions'
import { buildPoolJoinPath } from '@/lib/pool-invite-path'
import {
  canUserCreatePoolInCompetition,
  countUserAdminPoolsForCompetition,
  createPool,
  fetchMyPools,
  MAX_POOLS_PER_COMPETITION,
  POOL_CREATION_LIMIT_MESSAGE,
  type PoolRow,
} from '@/lib/pools'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { supabase } from '@/lib/supabase'

type Props = {
  competition: Competition
}

export default function OfficialPoolCreateClient({ competition }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [myAdminPoolCount, setMyAdminPoolCount] = useState(0)
  const [createName, setCreateName] = useState('')
  const [createPublic, setCreatePublic] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [createdPool, setCreatedPool] = useState<PoolRow | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)

  const title = competitionCardTitle(competition.slug, competition.name)
  const schoolsCompetitionId =
    competition.slug === SCHOOLS_COMPETITION_SLUG ? competition.id : null
  const canCreate = myAdminPoolCount < MAX_POOLS_PER_COMPETITION
  const nameValid = createName.trim().length >= 3

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setAuthReady(true)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setMyAdminPoolCount(0)
      return
    }
    void fetchMyPools(supabase, user.id).then(({ pools }) => {
      setMyAdminPoolCount(
        countUserAdminPoolsForCompetition(
          pools,
          user.id,
          competition.id,
          schoolsCompetitionId
        )
      )
    })
  }, [user, competition.id, schoolsCompetitionId])

  async function onCreate() {
    if (!nameValid || !canCreate) return
    if (!user) {
      setMessage('Log in to create a pool.')
      return
    }
    setCreating(true)
    setMessage('')
    setCreatedPool(null)
    try {
      const { pool, error } = await createPool(supabase, {
        name: createName.trim(),
        isPublic: createPublic,
        competitionId: competition.id,
      })
      if (error || !pool) {
        setMessage(error?.message ?? 'Could not create pool.')
        return
      }
      setCreatedPool(pool)
      setCreateName('')
      setCreatePublic(false)
      setMyAdminPoolCount((c) => c + 1)
    } finally {
      setCreating(false)
    }
  }

  async function copyInvite() {
    if (!createdPool || !user || typeof window === 'undefined') return
    const url = `${window.location.origin}${buildPoolJoinPath(createdPool.invite_token, user.id)}`
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
    } catch {
      setMessage('Could not copy invite link.')
    }
  }

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[#0a0a0b] px-4 py-16 text-center text-sm text-gray-400">
        Loading…
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0a0a0b] text-white">
        <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
          <Link href={`/competitions/${competition.slug}`} className="text-sm text-gray-400 hover:text-white">
            ← Back to {title}
          </Link>
          <h1 className="mt-8 text-2xl font-black">Create a pool</h1>
          <p className="mt-4 text-sm text-gray-400">Log in to create a pool for {title}.</p>
          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            Log in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white">
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <Link href={`/competitions/${competition.slug}`} className="text-sm text-gray-400 hover:text-white">
          ← Back to {title}
        </Link>

        <h1 className="mt-8 text-2xl font-black tracking-tight">Create a pool</h1>
        <p className="mt-2 text-sm text-gray-400">
          Name your pool and invite your group. Official fixtures are included automatically.
        </p>

        {createdPool ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6">
            <p className="text-sm font-semibold text-emerald-300">Pool &ldquo;{createdPool.name}&rdquo; created</p>
            <p className="text-sm leading-relaxed text-gray-300">
              Official fixtures are included automatically for this competition.
            </p>
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="w-full rounded-xl border border-white/15 bg-[#111318] px-4 py-3 text-sm font-semibold text-white hover:bg-[#161a22]"
            >
              {inviteCopied ? 'Invite link copied' : 'Copy invite link'}
            </button>
            <Link
              href={`/competitions/${competition.slug}`}
              className="block text-center text-sm font-medium text-gray-400 hover:text-white"
            >
              Back to {title}
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-[#111318] p-6">
            {!canCreate ? (
              <p className="text-sm text-amber-400">{POOL_CREATION_LIMIT_MESSAGE}</p>
            ) : null}

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Pool name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Pool name (3+ characters)"
                disabled={!canCreate || creating}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a0a0b] px-4 py-3 text-sm text-white placeholder:text-gray-600 disabled:opacity-50"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={createPublic}
                onChange={(e) => setCreatePublic(e.target.checked)}
                disabled={!canCreate || creating}
                className="mt-1 rounded border-gray-600"
              />
              <span>
                <span className="font-semibold text-white">Public pool</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Searchable in pool search. Turn off for invite-only.
                </span>
              </span>
            </label>

            {message ? <p className="text-sm text-red-400">{message}</p> : null}

            <button
              type="button"
              disabled={!canCreate || creating || !nameValid}
              onClick={() => void onCreate()}
              className="w-full rounded-xl bg-red-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create pool'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
