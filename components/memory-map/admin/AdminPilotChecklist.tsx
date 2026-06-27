'use client'

import type { MemoryMapBundle, MemoryMapMember } from '@/lib/memory-map/types'
import { mapHealthChecklist } from '@/lib/memory-map/utils'

type CheckStatus = 'ok' | 'warn' | 'fail'

type CheckItem = { label: string; status: CheckStatus }

type Props = {
  bundle: MemoryMapBundle
  members: MemoryMapMember[]
  pendingCount: number
  highRiskPending: number
}

function statusIcon(s: CheckStatus): string {
  if (s === 'ok') return '✓'
  if (s === 'warn') return '○'
  return '✗'
}

function statusClass(s: CheckStatus): string {
  if (s === 'ok') return 'text-green-400'
  if (s === 'warn') return 'text-amber-400'
  return 'text-red-400'
}

export default function AdminPilotChecklist({ bundle, members, pendingCount, highRiskPending }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const approvedStories = stories.filter((s) => s.status === 'approved')
  const approvedPins = pins.filter((p) => p.status === 'approved')
  const admins = members.filter((m) => m.status === 'approved' && (m.role === 'admin' || m.role === 'moderator'))
  const contributors = members.filter((m) => m.status === 'approved' && m.role === 'contributor')

  const setup: CheckItem[] = [
    { label: 'Organisation created', status: map.organisation_id ? 'ok' : 'fail' },
    { label: 'Memory Map active', status: map.status === 'active' ? 'ok' : 'warn' },
    { label: 'Profile image uploaded', status: map.profile_image_url ? 'ok' : 'warn' },
    { label: 'Background image uploaded', status: map.landing_background_url ? 'ok' : 'warn' },
    { label: 'Sponsor added (optional)', status: map.sponsor_name ? 'ok' : 'warn' },
    {
      label: areas.some((a) => a.is_active) ? 'At least one active area' : 'Create your first area',
      status: areas.some((a) => a.is_active) ? 'ok' : 'fail',
    },
    {
      label: categories.some((c) => c.is_active) ? 'Default category available' : 'Default category (auto-created on submit)',
      status: categories.some((c) => c.is_active) ? 'ok' : 'warn',
    },
  ]

  const content: CheckItem[] = [
    { label: 'At least one pin approved', status: approvedPins.length > 0 ? 'ok' : 'fail' },
    { label: 'At least one story approved', status: approvedStories.length > 0 ? 'ok' : 'fail' },
    { label: 'Pending stories reviewed', status: pendingCount === 0 ? 'ok' : 'warn' },
    { label: 'High-risk stories reviewed', status: highRiskPending === 0 ? 'ok' : 'warn' },
  ]

  const access: CheckItem[] = [
    { label: 'At least one admin assigned', status: admins.length > 0 ? 'ok' : 'fail' },
    { label: 'Contributors approved', status: contributors.length > 0 ? 'ok' : 'warn' },
    { label: `Visibility: ${map.visibility}`, status: map.visibility ? 'ok' : 'fail' },
    { label: 'QR link ready', status: map.slug ? 'ok' : 'fail' },
  ]

  const demo: CheckItem[] = [
    { label: 'Landing page ready', status: map.status === 'active' ? 'ok' : 'warn' },
    { label: 'Map content ready', status: approvedPins.length > 0 && approvedStories.length > 0 ? 'ok' : 'warn' },
    { label: 'Add-story flow available', status: 'ok' },
    { label: 'Admin approval workflow', status: pendingCount >= 0 ? 'ok' : 'warn' },
  ]

  const health = mapHealthChecklist(bundle)
  const healthScore = health.filter((h) => h.ok).length

  return (
    <div className="space-y-6">
      <div className="mm-card rounded-2xl p-4">
        <p className="text-sm font-black">Pilot readiness</p>
        <p className="mm-muted mt-1 text-xs">Map health: {healthScore}/{health.length} checks passed</p>
      </div>
      <CheckSection title="Setup" items={setup} />
      <CheckSection title="Content" items={content} />
      <CheckSection title="Access" items={access} />
      <CheckSection title="Demo readiness" items={demo} />
    </div>
  )
}

function CheckSection({ title, items }: { title: string; items: CheckItem[] }) {
  return (
    <section className="mm-card rounded-2xl p-4">
      <h3 className="text-sm font-black">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs">
            <span className={statusClass(item.status)}>{statusIcon(item.status)}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
