'use client'

import Link from 'next/link'
import type { MemoryMapBundle } from '@/lib/memory-map/types'
import type { MemoryMapAnalyticsSummary } from '@/lib/memory-map/analytics'
import { bundleStats, mapHealthChecklist } from '@/lib/memory-map/utils'

type Props = {
  bundle: MemoryMapBundle
  pendingContributors: number
  analytics?: MemoryMapAnalyticsSummary | null
  onNavigate: (tab: string) => void
}

export default function AdminOverviewPanel({ bundle, pendingContributors, analytics, onNavigate }: Props) {
  const stats = bundleStats(bundle)
  const health = mapHealthChecklist(bundle)
  const healthOk = health.filter((h) => h.ok).length
  const activeAreas = bundle.areas.filter((a) => a.is_active)
  const activeCategories = bundle.categories.filter((c) => c.is_active)

  return (
    <div className="space-y-6">
      {activeAreas.length === 0 ? (
        <div className="mm-card rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
          <p className="text-sm font-black">Create your first area</p>
          <p className="mm-muted mt-1 text-xs">Contributors cannot place memories until at least one area exists.</p>
          <button type="button" onClick={() => onNavigate('areas')} className="mm-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-xs font-bold">
            Add area
          </button>
        </div>
      ) : null}

      {activeCategories.length === 0 ? (
        <div className="mm-card rounded-2xl border border-white/10 p-4">
          <p className="text-sm font-black">Organise with categories</p>
          <p className="mm-muted mt-1 text-xs">
            Categories are optional for contributors — General is created automatically. Add more to organise pins and stories.
          </p>
          <button type="button" onClick={() => onNavigate('categories')} className="mm-btn-secondary mt-3 rounded-lg px-3 py-1.5 text-xs font-bold">
            Manage categories
          </button>
        </div>
      ) : null}

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
            ['Add official content', 'add-content'],
            ['Review pending', 'pending'],
            ['Approve contributors', 'contributors'],
            ['Set default map opening point', 'map-defaults'],
            ['Edit branding', 'branding'],
            ['Download QR', 'share'],
          ].map(([label, tab]) => (
            <button key={tab} type="button" onClick={() => onNavigate(tab)} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
              {label}
            </button>
          ))}
        </div>
      </div>

      {analytics ? (
        <div className="mm-card rounded-2xl p-4">
          <p className="text-sm font-black">Pilot analytics (30 days)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Landing views', analytics.landing_views],
              ['Map opens', analytics.map_opens],
              ['Story opens', analytics.story_opens],
              ['Pin opens', analytics.pin_opens],
              ['Contributor requests', analytics.contributor_requests],
              ['Story submissions', analytics.story_submissions],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="mm-muted text-[10px] uppercase">{label}</p>
                <p className="text-lg font-black">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
