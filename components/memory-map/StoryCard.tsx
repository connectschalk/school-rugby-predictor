'use client'

import Link from 'next/link'
import type { MemoryStory } from '@/lib/memory-map/types'
import { storyTypeLabel } from '@/lib/memory-map/utils'

type Props = {
  story: MemoryStory
  mapSlug: string
  compact?: boolean
  showMeta?: boolean
}

export default function StoryCard({ story, mapSlug, compact, showMeta }: Props) {
  const thumb = story.media?.find((m) => m.media_type === 'image')?.file_url
    ?? story.media?.[0]?.thumbnail_url
    ?? story.media?.[0]?.file_url
  const mediaCount = story.media?.length ?? 0

  return (
    <Link
      href={`/memory-map/${mapSlug}/story/${story.id}`}
      className={`mm-card flex gap-3 rounded-2xl transition hover:border-white/25 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-[10px] font-bold uppercase text-white/40">
            <span>{storyTypeLabel(story.story_type).slice(0, 1)}</span>
            <span className="mt-0.5 text-[9px]">{storyTypeLabel(story.story_type)}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{story.title}</p>
        <p className="mm-muted text-xs">{story.event_year} · {storyTypeLabel(story.story_type)}</p>
        <p className="mm-muted mt-0.5 truncate text-xs">{story.logged_by_display_name ?? 'Contributor'}</p>
        {showMeta ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {story.tags?.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">#{tag}</span>
            ))}
            {mediaCount > 0 ? <span className="text-[10px] text-white/50">{mediaCount} media</span> : null}
          </div>
        ) : null}
      </div>
    </Link>
  )
}
