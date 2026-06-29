'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MemoryMap, MemoryPin, MemoryStory } from '@/lib/memory-map/types'
import { uniqueContributors, yearRangeForStories } from '@/lib/memory-map/utils'
import StoryCard from '@/components/memory-map/StoryCard'
import MemoryMapSponsorStrip from '@/components/memory-map/MemoryMapSponsorStrip'
import MemoryMapThemedRoot from '@/components/memory-map/MemoryMapThemedRoot'
import {
  mmActiveTabStyle,
  mmOutlineButtonStyle,
  mmPinBadgeStyle,
  mmPrimaryButtonStyle,
  resolvePublicMemoryMapTheme,
} from '@/lib/memory-map/theme'

type Props = {
  open: boolean
  pin: MemoryPin | null
  stories: MemoryStory[]
  mapSlug: string
  map?: MemoryMap
  areaName?: string
  onClose: () => void
}

type Tab = 'stories' | 'about'

export default function PinPreviewSheet({ open, pin, stories, mapSlug, map, areaName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('stories')
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const theme = useMemo(() => resolvePublicMemoryMapTheme(map), [map])

  useEffect(() => {
    setMounted(true)
  }, [])

  const sorted = useMemo(
    () => [...stories].sort((a, b) => b.event_year - a.event_year || a.title.localeCompare(b.title)),
    [stories]
  )

  const byYear = useMemo(() => {
    const yearMap = new Map<number, MemoryStory[]>()
    for (const s of sorted) {
      const list = yearMap.get(s.event_year) ?? []
      list.push(s)
      yearMap.set(s.event_year, list)
    }
    return [...yearMap.entries()].sort((a, b) => b[0] - a[0])
  }, [sorted])

  const visibleGroups = expanded ? byYear : byYear.slice(0, 3)
  const yearRange = yearRangeForStories(stories)
  const contributors = uniqueContributors(stories)

  if (!open || !pin || !mounted) return null

  return createPortal(
    <MemoryMapThemedRoot map={map}>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/60" aria-hidden />
        <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
        <div className="fixed inset-x-0 bottom-0 z-[51] box-border px-4 mm-modal-bottom-pad pointer-events-none md:px-6 md:pb-6">
          <div
            className={`mm-card pointer-events-auto relative mx-auto flex w-full max-w-md flex-col rounded-t-3xl shadow-xl transition-all md:max-w-lg ${
              expanded ? 'max-h-[92dvh]' : 'max-h-[70dvh]'
            }`}
          >
            <div className="shrink-0 border-b border-white/10 p-5 pb-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
                      style={mmPinBadgeStyle(theme, pin.colour ?? pin.category?.colour)}
                    >
                      {pin.category?.icon?.slice(0, 1).toUpperCase() ?? '●'}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                      {pin.category?.name ?? 'Pin'}
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-black leading-tight text-white">{pin.title}</h2>
                  <p className="mm-muted mt-1 text-xs">
                    {yearRange} · {stories.length} {stories.length === 1 ? 'story' : 'stories'}
                    {areaName ? ` · ${areaName}` : ''}
                  </p>
                </div>
                <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xl text-white/60" aria-label="Close">
                  ×
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                {(['stories', 'about'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                      tab === t ? '' : 'mm-btn-secondary'
                    }`}
                    style={tab === t ? mmActiveTabStyle(theme) : undefined}
                  >
                    {t === 'stories' ? 'Stories' : 'About this place'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold ${
                    expanded ? 'mm-btn-secondary' : 'border bg-transparent'
                  }`}
                  style={expanded ? undefined : mmOutlineButtonStyle(theme)}
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-3">
              {tab === 'stories' ? (
                <div className="space-y-5">
                  {stories.length === 0 ? (
                    <p className="mm-muted text-sm">No approved stories at this pin yet.</p>
                  ) : (
                    visibleGroups.map(([year, yearStories]) => (
                      <section key={year}>
                        <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-white/50">{year}</h3>
                        <div className="space-y-2">
                          {yearStories.map((story) => (
                            <StoryCard key={story.id} story={story} mapSlug={mapSlug} compact showMeta />
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                  {!expanded && byYear.length > 3 ? (
                    <button type="button" onClick={() => setExpanded(true)} className="mm-btn-secondary w-full rounded-xl py-2 text-xs font-bold">
                      View all stories ({stories.length})
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {pin.description ? <p className="leading-relaxed text-white/90">{pin.description}</p> : null}
                  <p><span className="mm-muted">Category:</span> {pin.category?.name ?? '—'}</p>
                  <p><span className="mm-muted">Contributors:</span> {contributors || '—'}</p>
                  <p><span className="mm-muted">First story:</span> {stories.length ? Math.min(...stories.map((s) => s.event_year)) : '—'}</p>
                  <p><span className="mm-muted">Latest story:</span> {stories.length ? Math.max(...stories.map((s) => s.event_year)) : '—'}</p>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 p-4">
              {map ? <MemoryMapSponsorStrip map={map} variant="subtle" className="mb-3 border-0 px-0" /> : null}
              <Link
                href={`/memory-map/${mapSlug}/add?pin=${pin.id}`}
                className="block rounded-2xl px-4 py-3 text-center text-sm font-black"
                style={mmPrimaryButtonStyle(theme)}
              >
                Add story to this pin
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MemoryMapThemedRoot>,
    document.body
  )
}
