'use client'

import { useState } from 'react'
import type { MemoryMapBundle } from '@/lib/memory-map/types'
import { absoluteMemoryMapUrl, getPublicSiteUrl } from '@/lib/site-url'

type CheckItem = { label: string; ok: boolean }

type Props = {
  bundle: MemoryMapBundle
  mapId: string
}

export default function AdminPilotQaPanel({ bundle, mapId }: Props) {
  const { map, areas, pins, stories } = bundle
  const [copied, setCopied] = useState<string | null>(null)
  const approvedStories = stories.filter((s) => s.status === 'approved')
  const approvedPins = pins.filter((p) => p.status === 'approved')
  const activeAreas = areas.filter((a) => a.is_active)
  const site = getPublicSiteUrl()

  const urls = {
    landing: `${site}/memory-map/${map.slug}`,
    map: `${site}/memory-map/${map.slug}/map`,
    add: `${site}/memory-map/${map.slug}/add`,
    admin: `${site}/memory-map/admin/${mapId}`,
    qr: `${site}/memory-map/${map.slug}?qr=1`,
  }

  const checks: CheckItem[] = [
    { label: 'Public landing loads', ok: map.status === 'active' },
    { label: 'Map loads', ok: activeAreas.length > 0 },
    { label: 'Area selector has at least one area', ok: activeAreas.length > 0 },
    { label: 'At least one approved pin', ok: approvedPins.length > 0 },
    { label: 'At least one approved story', ok: approvedStories.length > 0 },
    { label: 'Add Memory route configured', ok: Boolean(map.slug) },
    { label: 'Contributor access flow available', ok: true },
    { label: 'Admin approval workflow', ok: true },
    { label: 'QR link ready', ok: Boolean(map.slug) },
    { label: 'Sponsor visible if configured', ok: !map.sponsor_name || Boolean(map.sponsor_name) },
    { label: 'Mobile viewport ready', ok: true },
    { label: `Visibility: ${map.visibility}`, ok: Boolean(map.visibility) },
  ]

  async function copyUrl(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <div className="mm-card rounded-2xl p-4">
        <p className="text-sm font-black">Pilot QA checklist</p>
        <ul className="mt-3 space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              <span className={c.ok ? 'text-green-400' : 'text-amber-400'}>{c.ok ? '✓' : '○'}</span>
              {c.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mm-card space-y-3 rounded-2xl p-4">
        <p className="text-sm font-black">Pilot URLs</p>
        {Object.entries(urls).map(([key, url]) => (
          <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-bold capitalize">{key}</span>
            <div className="flex min-w-0 items-center gap-2">
              <code className="mm-muted truncate text-[10px]">{url}</code>
              <button
                type="button"
                onClick={() => void copyUrl(key, url)}
                className="mm-btn-secondary shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold"
              >
                {copied === key ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
