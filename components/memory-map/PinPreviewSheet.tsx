'use client'

import Link from 'next/link'
import type { MemoryPin, MemoryStory } from '@/lib/memory-map/types'
import StoryCard from '@/components/memory-map/StoryCard'

type Props = {
  open: boolean
  pin: MemoryPin | null
  stories: MemoryStory[]
  mapSlug: string
  onClose: () => void
}

export default function PinPreviewSheet({ open, pin, stories, mapSlug, onClose }: Props) {
  if (!open || !pin) return null

  const years = stories.map((s) => s.event_year)
  const yearRange =
    years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : '—'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="mm-card relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">
              {pin.category?.name ?? 'Memory pin'}
            </p>
            <h2 className="text-xl font-black">{pin.title}</h2>
            <p className="mm-muted mt-1 text-sm">{yearRange} · {stories.length} stories</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-white/60">
            ×
          </button>
        </div>
        {pin.description ? <p className="mm-muted mt-3 text-sm">{pin.description}</p> : null}

        <div className="mt-5 space-y-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} mapSlug={mapSlug} compact />
          ))}
        </div>

        <Link
          href={`/memory-map/${mapSlug}/add?pin=${pin.id}`}
          className="mm-btn-primary mt-5 block rounded-2xl px-4 py-3 text-center text-sm font-black"
        >
          Add story to this pin
        </Link>
      </div>
    </div>
  )
}
