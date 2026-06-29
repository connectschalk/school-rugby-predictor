'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ORG_TYPE_LABELS } from '@/lib/memory-map/create-map-form'
import {
  buildOrganisationAdminInviteUrl,
  fetchOrganisationInvites,
  fetchOrganisationMaps,
  fetchOrganisationMembers,
  inviteOrganisationAdmin,
  organisationDashboardPath,
  removeOrganisationAdmin,
  revokeOrganisationInvite,
  type OrganisationAccessLevel,
  type OrganisationAdminInviteRow,
  type OrganisationRow,
} from '@/lib/memory-map/organisations'

type Props = {
  organisation: OrganisationRow
  accessLevel: OrganisationAccessLevel
  backHref: string
  backLabel: string
  showPlatformAdminShortcut?: boolean
}

export default function MemoryMapOrganisationDetailPanel({
  organisation,
  accessLevel,
  backHref,
  backLabel,
  showPlatformAdminShortcut = false,
}: Props) {
  const isPlatformAdmin = accessLevel === 'platform_admin'
  const organisationId = organisation.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [maps, setMaps] = useState<Awaited<ReturnType<typeof fetchOrganisationMaps>>['maps']>([])
  const [members, setMembers] = useState<Awaited<ReturnType<typeof fetchOrganisationMembers>>['members']>([])
  const [invites, setInvites] = useState<OrganisationAdminInviteRow[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const createMapHref = isPlatformAdmin
    ? `/memory-map/admin/create?organisationId=${encodeURIComponent(organisationId)}`
    : organisationDashboardPath(organisation.slug) + '/maps/new'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const requests: [
      Promise<Awaited<ReturnType<typeof fetchOrganisationMaps>>>,
      Promise<Awaited<ReturnType<typeof fetchOrganisationMembers>>>,
      Promise<Awaited<ReturnType<typeof fetchOrganisationInvites>> | null>,
    ] = [
      fetchOrganisationMaps(supabase, organisationId),
      fetchOrganisationMembers(supabase, organisationId),
      isPlatformAdmin ? fetchOrganisationInvites(supabase, organisationId) : Promise.resolve(null),
    ]

    const [mapsRes, membersRes, invitesRes] = await Promise.all(requests)

    setMaps(mapsRes.maps)
    setMembers(membersRes.members)
    setInvites(invitesRes?.invites ?? [])
    setError(mapsRes.error ?? membersRes.error ?? invitesRes?.error ?? '')
    setLoading(false)
  }, [organisationId, isPlatformAdmin])

  useEffect(() => {
    void load()
  }, [load])

  async function onSendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteBusy(true)
    setError('')
    setLastInviteLink(null)
    const { token, error: inviteErr } = await inviteOrganisationAdmin(supabase, organisationId, {
      email: inviteEmail.trim(),
      invitedDisplayName: inviteName.trim() || undefined,
      inviteMessage: inviteMessage.trim() || undefined,
    })
    setInviteBusy(false)
    if (inviteErr || !token) {
      setError(inviteErr ?? 'Could not create invite.')
      return
    }
    setLastInviteLink(buildOrganisationAdminInviteUrl(token))
    setInviteEmail('')
    setInviteName('')
    setInviteMessage('')
    await load()
  }

  async function onCopyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link.')
    }
  }

  async function onRevoke(inviteId: string) {
    const { error: revokeErr } = await revokeOrganisationInvite(supabase, inviteId)
    if (revokeErr) setError(revokeErr)
    await load()
  }

  async function onRemoveAdmin(userId: string) {
    const { error: removeErr } = await removeOrganisationAdmin(supabase, organisationId, userId)
    if (removeErr) setError(removeErr)
    await load()
  }

  if (loading) {
    return <p className="mm-muted px-5 py-10 text-sm">Loading organisation…</p>
  }

  const primaryStyle = organisation.primary_color
    ? ({ '--mm-brand-primary': organisation.primary_color } as React.CSSProperties)
    : undefined

  return (
    <main className="mx-auto max-w-3xl px-5 py-10" style={primaryStyle}>
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">
        {isPlatformAdmin ? 'Organisation' : 'Organisation dashboard'}
      </p>
      <div className="mt-3 flex items-start gap-4">
        {organisation.logo_url ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-white/5">
            <Image src={organisation.logo_url} alt="" fill className="object-cover" unoptimized />
          </div>
        ) : null}
        <div>
          <h1 className="text-2xl font-black">{organisation.name}</h1>
          <p className="mm-muted mt-1 text-sm">
            {ORG_TYPE_LABELS[organisation.type] ?? organisation.type} · /{organisation.slug}
          </p>
        </div>
      </div>
      {organisation.description ? <p className="mt-3 text-sm text-white/85">{organisation.description}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {organisation.primary_color ? (
          <span
            className="rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: organisation.primary_color, color: organisation.primary_color }}
          >
            Primary {organisation.primary_color}
          </span>
        ) : null}
        {organisation.secondary_color ? (
          <span
            className="rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: organisation.secondary_color, color: organisation.secondary_color }}
          >
            Secondary {organisation.secondary_color}
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={createMapHref} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-black">
          Create Memory Map
        </Link>
        {showPlatformAdminShortcut ? (
          <Link
            href={`/memory-map/admin/organisations/${organisationId}`}
            className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold"
          >
            Platform admin view
          </Link>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <section className="mt-10">
        <h2 className="text-lg font-black">Memory Maps</h2>
        {maps.length === 0 ? (
          <p className="mm-muted mt-2 text-sm">No maps yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {maps.map((map) => (
              <li key={map.id}>
                <Link href={`/memory-map/admin/${map.id}`} className="mm-card block rounded-xl p-3 text-sm font-bold">
                  {map.title} <span className="mm-muted font-normal">· {map.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-black">Organisation admins</h2>
        {members.length === 0 ? (
          <p className="mm-muted mt-2 text-sm">No admins yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {members.map((member) => (
              <li key={member.id} className="mm-card flex items-center justify-between gap-3 rounded-xl p-3 text-sm">
                <div>
                  <p className="font-bold">{member.display_name ?? 'Memory Map user'}</p>
                  <p className="mm-muted text-xs">
                    {member.role} · joined {member.approved_at ? new Date(member.approved_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                {isPlatformAdmin ? (
                  <button
                    type="button"
                    onClick={() => void onRemoveAdmin(member.user_id)}
                    className="text-xs font-bold text-red-300"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPlatformAdmin ? (
        <section className="mt-10">
          <h2 className="text-lg font-black">Invite organisation admin</h2>
          <p className="mm-muted mt-1 text-sm">
            They will receive organisation admin access only — not platform admin or Predictor access.
          </p>
          <form onSubmit={(e) => void onSendInvite(e)} className="mt-4 space-y-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Display name (optional)"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Optional message"
              rows={2}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <button type="submit" disabled={inviteBusy} className="mm-btn-primary w-full rounded-xl py-3 text-sm font-black disabled:opacity-50">
              {inviteBusy ? 'Sending…' : 'Send invite'}
            </button>
          </form>

          {lastInviteLink ? (
            <div className="mm-card mt-4 rounded-xl p-4 text-sm">
              <p className="font-bold">Invite link created</p>
              <p className="mm-muted mt-1 break-all text-xs">{lastInviteLink}</p>
              <button type="button" onClick={() => void onCopyLink(lastInviteLink)} className="mm-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-xs font-bold">
                {copied ? 'Copied!' : 'Copy invite link'}
              </button>
            </div>
          ) : null}

          <h3 className="mt-8 text-sm font-black uppercase tracking-wide text-white/70">Invites</h3>
          <ul className="mt-3 space-y-2">
            {invites.map((invite) => {
              const link = buildOrganisationAdminInviteUrl(invite.token)
              return (
                <li key={invite.id} className="mm-card rounded-xl p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{invite.email}</p>
                      <p className="mm-muted text-xs">
                        {invite.status} · expires {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    {invite.status === 'pending' ? (
                      <button type="button" onClick={() => void onRevoke(invite.id)} className="text-xs font-bold text-red-300">
                        Revoke
                      </button>
                    ) : null}
                  </div>
                  {invite.status === 'pending' ? (
                    <button type="button" onClick={() => void onCopyLink(link)} className="mm-btn-secondary mt-2 rounded-lg px-3 py-1 text-xs font-bold">
                      Copy link
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <Link href={backHref} className="mm-btn-secondary mt-10 block rounded-2xl py-3 text-center text-sm font-bold">
        {backLabel}
      </Link>
    </main>
  )
}
