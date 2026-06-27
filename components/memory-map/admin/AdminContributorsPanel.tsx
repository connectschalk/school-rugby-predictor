'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { manageMemoryMapMember, createMemoryMapInvite } from '@/lib/memory-map/mutations'
import { absoluteMemoryMapJoinUrl } from '@/lib/site-url'
import type { MemberStatus, MemoryMapMember } from '@/lib/memory-map/types'

type Props = {
  mapId: string
  mapSlug: string
  members: MemoryMapMember[]
  isAppAdmin: boolean
  isOrgAdmin: boolean
  onChanged: () => void
}

type Tab = MemberStatus

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
]

export default function AdminContributorsPanel({ mapId, mapSlug, members, isAppAdmin, isOrgAdmin, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [autoApprove, setAutoApprove] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  const filtered = useMemo(() => members.filter((m) => m.status === tab), [members, tab])

  async function act(memberId: string, action: Parameters<typeof manageMemoryMapMember>[2], opts?: { reason?: string; newRole?: string }) {
    setBusy(true)
    setError('')
    const { error: err } = await manageMemoryMapMember(supabase, memberId, action, opts)
    setBusy(false)
    if (err) setError(err)
    else {
      setRejectId(null)
      setRejectReason('')
      onChanged()
    }
  }

  async function onCreateInvite() {
    setBusy(true)
    setError('')
    const { token, error: err } = await createMemoryMapInvite(supabase, mapId, {
      role: 'contributor',
      autoApprove,
    })
    setBusy(false)
    if (err || !token) {
      setError(err ?? 'Could not create invite.')
      return
    }
    setInviteUrl(absoluteMemoryMapJoinUrl(mapSlug, token))
  }

  async function copyInvite() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="mm-card space-y-3 rounded-2xl p-4">
        <p className="text-sm font-bold">Contributor invite link</p>
        <p className="mm-muted text-xs">Share with old boys, staff or alumni. They sign in and submit a contributor request marked as invite.</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          Auto-approve contributors who use this link
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void onCreateInvite()} className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">
            Create contributor invite link
          </button>
          {inviteUrl ? (
            <button type="button" onClick={() => void copyInvite()} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
              {inviteCopied ? 'Copied' : 'Copy invite link'}
            </button>
          ) : null}
        </div>
        {inviteUrl ? <p className="mm-muted break-all text-[10px]">{inviteUrl}</p> : null}
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tab === t.id ? 'mm-btn-primary' : 'mm-btn-secondary'}`}>
            {t.label} ({members.filter((m) => m.status === t.id).length})
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mm-muted text-sm">No {tab} members.</p>
      ) : (
        filtered.map((m) => (
          <MemberCard key={m.id} member={m} busy={busy} isAppAdmin={isAppAdmin} isOrgAdmin={isOrgAdmin} onAct={act} onReject={() => setRejectId(m.id)} />
        ))
      )}
      {rejectId ? (
        <div className="mm-card rounded-xl p-4">
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={!rejectReason.trim() || busy} onClick={() => void act(rejectId, 'reject', { reason: rejectReason })} className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">Confirm reject</button>
            <button type="button" onClick={() => setRejectId(null)} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MemberCard({
  member,
  busy,
  isAppAdmin,
  isOrgAdmin,
  onAct,
  onReject,
}: {
  member: MemoryMapMember
  busy: boolean
  isAppAdmin: boolean
  isOrgAdmin: boolean
  onAct: (id: string, action: Parameters<typeof manageMemoryMapMember>[2], opts?: { reason?: string; newRole?: string }) => Promise<void>
  onReject: () => void
}) {
  const canAssignMapAdmin = isAppAdmin || isOrgAdmin
  return (
    <div className="mm-card rounded-2xl p-4 text-sm">
      <p className="font-bold">User {member.user_id.slice(0, 8)}…</p>
      <p className="mm-muted text-xs">Role: {member.role} · {member.status}</p>
      {member.relationship ? <p className="mm-muted text-xs">{member.relationship}</p> : null}
      {member.request_message ? <p className="mt-1 text-xs">{member.request_message}</p> : null}
      {member.approved_at ? <p className="mm-muted mt-1 text-xs">Approved {new Date(member.approved_at).toLocaleDateString()}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {member.status === 'pending' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'approve')} className="mm-btn-primary rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50">Approve</button>
            <button type="button" disabled={busy} onClick={onReject} className="rounded-lg border border-red-400/40 px-3 py-1 text-xs font-bold text-red-300">Reject</button>
          </>
        ) : null}
        {member.status === 'approved' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'suspend')} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">Suspend</button>
            {canAssignMapAdmin ? (
              <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'change_role', { newRole: 'admin' })} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">Make admin</button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'change_role', { newRole: 'moderator' })} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">Make moderator</button>
            <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'remove')} className="rounded-lg border border-red-400/40 px-3 py-1 text-xs font-bold text-red-300">Remove</button>
          </>
        ) : null}
        {member.status === 'suspended' ? (
          <button type="button" disabled={busy} onClick={() => void onAct(member.id, 'reactivate')} className="mm-btn-primary rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50">Reactivate</button>
        ) : null}
      </div>
    </div>
  )
}
