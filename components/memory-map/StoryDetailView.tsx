'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MemoryMapBundle, MemoryStory } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import { storyTypeLabel, uploadModeLabel } from '@/lib/memory-map/utils'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import StoryCard from '@/components/memory-map/StoryCard'
import MemoryMapSponsorStrip from '@/components/memory-map/MemoryMapSponsorStrip'
import StatusBadge, { RiskBadge } from '@/components/memory-map/StatusBadge'

type Props = {
  bundle: MemoryMapBundle
  story: MemoryStory
  isAdminView?: boolean
}

export default function StoryDetailView({ bundle, story, isAdminView }: Props) {
  const { map, stories, pins, areas, categories } = bundle
  const [photoIndex, setPhotoIndex] = useState(0)

  const pin = pins.find((p) => p.id === story.pin_id)
  const area = areas.find((a) => a.id === pin?.area_id)
  const category = categories.find((c) => c.id === pin?.category_id)
  const related = stories.filter((s) => s.pin_id === story.pin_id && s.id !== story.id && s.status === 'approved')

  const photos = (story.media ?? []).filter((m) => m.media_type === 'image')
  const videos = (story.media ?? []).filter((m) => m.media_type === 'video')
  const hasText = Boolean(story.description?.trim())

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}/map`} />

      <article className="mx-auto max-w-lg px-4 py-6 pb-24">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">{story.event_year}</p>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">{storyTypeLabel(story.story_type)}</span>
          {isAdminView ? (
            <>
              <StatusBadge status={story.status} />
              <RiskBadge level={story.risk_level} />
            </>
          ) : null}
        </div>

        <h1 className="mt-2 text-2xl font-black leading-tight">{story.title}</h1>
        <p className="mm-muted mt-2 text-sm">
          Logged by {story.logged_by_display_name ?? 'Contributor'}
          {area ? ` · ${area.name}` : ''}
          {pin ? ` · ${pin.title}` : ''}
        </p>
        {category ? <p className="mm-muted text-xs">{category.name}</p> : null}

        <div className="mt-6 overflow-hidden rounded-2xl bg-black/40">
          {videos.length > 0 ? (
            <video src={videos[0]!.file_url} controls playsInline className="aspect-video w-full bg-black" />
          ) : photos.length > 0 ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[photoIndex]?.file_url ?? photos[0]!.file_url} alt="" className="w-full object-cover" />
              {photos.length > 1 ? (
                <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                  <button type="button" disabled={photoIndex === 0} onClick={() => setPhotoIndex((i) => i - 1)} className="text-xs font-bold disabled:opacity-40">
                    ← Prev
                  </button>
                  <span className="text-xs text-white/60">{photoIndex + 1} / {photos.length}</span>
                  <button type="button" disabled={photoIndex >= photos.length - 1} onClick={() => setPhotoIndex((i) => i + 1)} className="text-xs font-bold disabled:opacity-40">
                    Next →
                  </button>
                </div>
              ) : null}
            </div>
          ) : hasText ? (
            <div className="p-6 text-sm leading-relaxed text-white/90 whitespace-pre-wrap">{story.description}</div>
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-white/40">No media</div>
          )}
        </div>

        {(videos.length > 0 || photos.length > 0) && hasText ? (
          <p className="mt-6 text-sm leading-relaxed text-white/90 whitespace-pre-wrap">{story.description}</p>
        ) : null}

        {story.tags && story.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {story.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold">#{tag}</span>
            ))}
          </div>
        ) : null}

        {isAdminView ? (
          <div className="mm-card mt-6 space-y-1 rounded-xl p-4 text-xs">
            <p className="font-bold text-white/80">Admin details</p>
            <p><span className="mm-muted">Upload mode:</span> {uploadModeLabel(story.upload_mode)}</p>
            <p><span className="mm-muted">Status:</span> {story.status}</p>
            <p><span className="mm-muted">Risk:</span> {story.risk_level}</p>
            {story.rejection_reason ? <p><span className="mm-muted">Rejection:</span> {story.rejection_reason}</p> : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/memory-map/${map.slug}/map`} className="mm-btn-secondary rounded-xl px-4 py-2 text-xs font-bold">
            Back to map
          </Link>
          {pin ? (
            <Link href={`/memory-map/${map.slug}/map`} className="mm-btn-secondary rounded-xl px-4 py-2 text-xs font-bold">
              Back to pin
            </Link>
          ) : null}
        </div>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-black uppercase tracking-wide">More at this place</h2>
            <div className="mt-3 space-y-3">
              {related.map((s) => (
                <StoryCard key={s.id} story={s} mapSlug={map.slug} showMeta />
              ))}
            </div>
          </section>
        ) : null}

        {map.sponsor_name ? (
          <div className="mt-10">
            <MemoryMapSponsorStrip map={map} variant="footer" />
          </div>
        ) : null}

        <Link href={`/memory-map/${map.slug}/add?pin=${story.pin_id}`} className="mm-btn-primary mt-6 block rounded-2xl px-4 py-3 text-center text-sm font-black">
          Add another memory here
        </Link>
      </article>
    </div>
  )
}
