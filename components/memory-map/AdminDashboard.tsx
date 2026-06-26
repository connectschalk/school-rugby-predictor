'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { AdminTab, MemoryMapBundle, MemoryPin, MemoryStory } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import StatusBadge, { RiskBadge } from '@/components/memory-map/StatusBadge'
import ShareQrPanel from '@/components/memory-map/ShareQrPanel'
import StoryCard from '@/components/memory-map/StoryCard'

type Props = {
  bundle: MemoryMapBundle
}

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pending', label: 'Pending' },
  { id: 'published', label: 'Published' },
  { id: 'pins', label: 'Pins' },
  { id: 'areas', label: 'Areas' },
  { id: 'categories', label: 'Categories' },
  { id: 'branding', label: 'Branding' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'share', label: 'Share / QR' },
]

export default function AdminDashboard({ bundle }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const [tab, setTab] = useState<AdminTab>('overview')
  const [localStories, setLocalStories] = useState(stories)
  const [selectedStory, setSelectedStory] = useState<MemoryStory | null>(null)
  const [selectedPin, setSelectedPin] = useState<MemoryPin | null>(null)

  const pending = useMemo(() => localStories.filter((s) => s.status === 'pending_review'), [localStories])
  const published = useMemo(() => localStories.filter((s) => s.status === 'approved'), [localStories])

  function approveStory(id: string) {
    setLocalStories((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'approved' as const } : s))
    )
    setSelectedStory(null)
  }

  function rejectStory(id: string) {
    setLocalStories((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'rejected' as const, rejection_reason: 'Rejected by admin' } : s))
    )
    setSelectedStory(null)
  }

  return (
    <div className="min-h-dvh pb-8" style={memoryMapThemeVars(map)}>
      <header className="mm-card border-x-0 border-t-0 px-4 py-4">
        <Link href="/memory-map" className="text-xs font-bold text-[var(--mm-accent)]">
          ← Memory Map
        </Link>
        <h1 className="mt-2 text-xl font-black">{map.title} — Admin</h1>
        <p className="mm-muted text-sm">Moderation, branding and map management</p>
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              tab === t.id ? 'mm-btn-primary' : 'mm-btn-secondary'
            }`}
          >
            {t.label}
            {t.id === 'pending' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4">
        {tab === 'overview' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Pending stories', pending.length],
              ['Published stories', published.length],
              ['Pins', pins.length],
              ['Areas', areas.length],
              ['Categories', categories.length],
              ['Contributors', '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="mm-card rounded-2xl p-4">
                <p className="mm-muted text-xs uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'pending' ? (
          <div className="space-y-3">
            {pending.length === 0 ? (
              <p className="mm-muted text-sm">No pending stories.</p>
            ) : (
              pending.map((story) => {
                const pin = pins.find((p) => p.id === story.pin_id)
                return (
                  <div key={story.id} className="mm-card rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{story.title}</p>
                        <p className="mm-muted text-xs">{story.event_year} · {story.logged_by_display_name}</p>
                        <p className="mm-muted text-xs">{pin?.title} · {areas.find((a) => a.id === pin?.area_id)?.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <StatusBadge status={story.status} />
                        <RiskBadge level={story.risk_level} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedStory(story)} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">
                        Review
                      </button>
                      <button type="button" onClick={() => approveStory(story.id)} className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold">
                        Approve
                      </button>
                      <button type="button" onClick={() => rejectStory(story.id)} className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300">
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}

        {tab === 'published' ? (
          <div className="space-y-3">
            {published.map((story) => (
              <StoryCard key={story.id} story={story} mapSlug={map.slug} />
            ))}
          </div>
        ) : null}

        {tab === 'pins' ? (
          <div className="space-y-3">
            {pins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                onClick={() => setSelectedPin(pin)}
                className="mm-card w-full rounded-2xl p-4 text-left"
              >
                <p className="font-bold">{pin.title}</p>
                <p className="mm-muted text-xs">{areas.find((a) => a.id === pin.area_id)?.name}</p>
                <StatusBadge status={pin.status} />
              </button>
            ))}
          </div>
        ) : null}

        {tab === 'areas' ? (
          <div className="space-y-3">
            {areas.map((area) => (
              <div key={area.id} className="mm-card rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{area.name}</p>
                  <span className="text-xs uppercase text-white/60">{area.map_type} map</span>
                </div>
                <p className="mm-muted mt-1 text-xs">{area.description}</p>
              </div>
            ))}
            <p className="mm-muted text-xs">Upload custom maps and geofences — storage integration Phase 4.</p>
          </div>
        ) : null}

        {tab === 'categories' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((cat) => (
              <div key={cat.id} className="mm-card flex items-center gap-3 rounded-2xl p-3">
                <span className="h-8 w-8 rounded-lg" style={{ backgroundColor: cat.colour }} />
                <div>
                  <p className="font-bold">{cat.name}</p>
                  <p className="mm-muted text-xs">{cat.icon}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'branding' ? (
          <div className="mm-card space-y-3 rounded-2xl p-4 text-sm">
            <p><span className="mm-muted">Primary:</span> {map.primary_color}</p>
            <p><span className="mm-muted">Accent:</span> {map.accent_color}</p>
            <p className="mm-muted text-xs">Profile/background uploads and live preview — Phase 4.</p>
          </div>
        ) : null}

        {tab === 'sponsor' ? (
          <div className="mm-card space-y-2 rounded-2xl p-4 text-sm">
            <p className="font-bold">{map.sponsor_name ?? 'No sponsor set'}</p>
            <p className="mm-muted">{map.sponsor_message}</p>
          </div>
        ) : null}

        {tab === 'share' ? <ShareQrPanel map={map} /> : null}
      </div>

      {selectedStory ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
            <h3 className="text-lg font-black">{selectedStory.title}</h3>
            <p className="mm-muted mt-2 text-sm">{selectedStory.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => approveStory(selectedStory.id)} className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold">Approve</button>
              <button type="button" onClick={() => rejectStory(selectedStory.id)} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-300">Reject</button>
              <button type="button" onClick={() => setSelectedStory(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedPin ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card w-full max-w-lg rounded-2xl p-5">
            <h3 className="text-lg font-black">Edit pin — {selectedPin.title}</h3>
            <p className="mm-muted mt-2 text-sm">
              Moving this pin will move all stories attached to it. Full pin editor — Phase 3.
            </p>
            <button type="button" onClick={() => setSelectedPin(null)} className="mm-btn-secondary mt-4 rounded-lg px-3 py-2 text-xs font-bold">
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
