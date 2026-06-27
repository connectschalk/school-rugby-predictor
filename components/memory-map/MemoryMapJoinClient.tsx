'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildLoginHref } from '@/lib/auth-return-path'
import { redeemMemoryMapInvite } from '@/lib/memory-map/mutations'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import { CONTRIBUTOR_SUBMISSION_POLICY_TEXT } from '@/lib/memory-map/contributor-policy'
import type { MemoryMap } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'

type Props = {
  map: MemoryMap
  mapSlug: string
  inviteToken: string
}

export default function MemoryMapJoinClient({ map, mapSlug, inviteToken }: Props) {
  const [relationship, setRelationship] = useState('')
  const [message, setMessage] = useState('I would like to contribute memories via invite link.')
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [autoApproved, setAutoApproved] = useState(false)
  const returnPath = `/memory-map/${mapSlug}/join?invite=${encodeURIComponent(inviteToken)}`

  async function onSubmit() {
    setError('')
    if (!policyAccepted) {
      setError('Please accept the contributor terms to continue.')
      return
    }
    setBusy(true)
    const access = await fetchContributorAccess(supabase, map.id)
    if (!access.isLoggedIn) {
      setBusy(false)
      setError('Please sign in first.')
      return
    }
    const { error: err, autoApproved: approved } = await redeemMemoryMapInvite(
      supabase,
      inviteToken,
      relationship,
      message,
      policyAccepted
    )
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    setAutoApproved(Boolean(approved))
    setDone(true)
  }

  return (
    <div className="mm-root mx-auto max-w-lg px-5 py-10" style={memoryMapThemeVars(map)}>
      <h1 className="text-2xl font-black">Join {map.title}</h1>
      <p className="mm-muted mt-2 text-sm">
        You have been invited to contribute memories to this Memory Map.
      </p>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      {done ? (
        <div className="mm-card mt-6 rounded-2xl p-5 text-sm">
          <p className="font-bold">{autoApproved ? 'You are approved to contribute!' : 'Request submitted'}</p>
          <p className="mm-muted mt-2">
            {autoApproved
              ? 'You can add memories now.'
              : 'A school admin will review your contributor request soon.'}
          </p>
          <Link href={`/memory-map/${mapSlug}/add`} className="mm-btn-primary mt-4 block rounded-xl py-3 text-center text-sm font-black">
            {autoApproved ? 'Add a memory' : 'View Memory Map'}
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Relationship (e.g. old boy, parent, staff)"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
          <label className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} className="mt-0.5" />
            <span>{CONTRIBUTOR_SUBMISSION_POLICY_TEXT}</span>
          </label>
          <button type="button" disabled={busy} onClick={() => void onSubmit()} className="mm-btn-primary w-full rounded-xl py-3 text-sm font-black disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit contributor request'}
          </button>
          <Link href={buildLoginHref(returnPath)} className="mm-btn-secondary block rounded-xl py-3 text-center text-sm font-bold">
            Sign in
          </Link>
        </div>
      )}
    </div>
  )
}
