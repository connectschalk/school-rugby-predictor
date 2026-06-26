'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { manageMemoryMapMember } from '@/lib/memory-map/mutations'
import type { MemberStatus, MemoryMapMember } from '@/lib/memory-map/types'

type Props = {
  members: MemoryMapMember[]
  isAppAdmin: boolean
  onChanged: () => void
}

type Tab = MemberStatus

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
]

export default function AdminContributorsPanel({ members, isAppAdmin, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

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

  return (
    <div className="space-y-4">
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
          <MemberCard key={m.id} member={m} busy={busy} isAppAdmin={isAppAdmin} onAct={act} onReject={() => setRejectId(m.id)} />
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
  onAct,
  onReject,
}: {
  member: MemoryMapMember
  busy: boolean
  isAppAdmin: boolean
  onAct: (id: string, action: Parameters<typeof manageMemoryMapMember>[2], opts?: { reason?: string; newRole?: string }) => Promise<void>
  onReject: () => void
}) {
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
            {isAppAdmin ? (
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
