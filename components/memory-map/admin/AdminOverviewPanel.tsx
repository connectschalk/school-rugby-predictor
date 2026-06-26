'use client'

import Link from 'next/link'
import type { MemoryMapBundle } from '@/lib/memory-map/types'
import { bundleStats, mapHealthChecklist } from '@/lib/memory-map/utils'

type Props = {
  bundle: MemoryMapBundle
  pendingContributors: number
  onNavigate: (tab: string) => void
}

export default function AdminOverviewPanel({ bundle, pendingContributors, onNavigate }: Props) {
  const stats = bundleStats(bundle)
  const health = mapHealthChecklist(bundle)
  const healthOk = health.filter((h) => h.ok).length

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Pending stories', stats.pendingStories, 'pending'],
          ['Pending contributors', pendingContributors, 'contributors'],
          ['Published stories', stats.storyCount, 'published'],
          ['Published pins', stats.pinCount, 'pins'],
          ['Areas', stats.areaCount, 'areas'],
          ['High-risk submissions', stats.highRiskPending, 'pending'],
        ].map(([label, value, tab]) => (
          <button
            key={String(label)}
            type="button"
            onClick={() => onNavigate(String(tab))}
            className="mm-card rounded-2xl p-4 text-left transition hover:border-white/25"
          >
            <p className="mm-muted text-xs uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
          </button>
        ))}
      </div>

      <div className="mm-card rounded-2xl p-4">
        <p className="text-sm font-black">Quick actions</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['Review pending', 'pending'],
            ['Approve contributors', 'contributors'],
            ['Edit branding', 'branding'],
            ['Download QR', 'share'],
          ].map(([label, tab]) => (
            <button key={tab} type="button" onClick={() => onNavigate(tab)} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mm-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black">Map health</p>
          <span className="text-xs font-bold text-[var(--mm-accent)]">{healthOk}/{health.length}</span>
        </div>
        <ul className="mt-3 space-y-2">
          {health.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <span className={item.ok ? 'text-green-400' : 'text-white/40'}>{item.ok ? '✓' : '○'}</span>
              <span className={item.ok ? 'text-white/80' : 'mm-muted'}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mm-card rounded-2xl p-4 text-sm">
        <p className="font-black">QR link</p>
        <p className="mm-muted mt-1 break-all text-xs">
          {typeof window !== 'undefined' ? `${window.location.origin}/memory-map/${bundle.map.slug}` : `/memory-map/${bundle.map.slug}`}
        </p>
        <Link href={`/memory-map/${bundle.map.slug}`} className="mt-2 inline-block text-xs font-bold text-[var(--mm-accent)]">
          Preview public landing →
        </Link>
      </div>
    </div>
  )
}
