'use client'

import Link from 'next/link'
import type { MemoryStory } from '@/lib/memory-map/types'

type Props = {
  story: MemoryStory
  mapSlug: string
  compact?: boolean
}

export default function StoryCard({ story, mapSlug, compact }: Props) {
  const thumb = story.media?.[0]?.thumbnail_url ?? story.media?.[0]?.file_url

  return (
    <Link
      href={`/memory-map/${mapSlug}/story/${story.id}`}
      className={`mm-card flex gap-3 rounded-2xl p-3 transition hover:border-white/25 ${compact ? '' : 'p-4'}`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-white/40">
            {story.story_type}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{story.title}</p>
        <p className="mm-muted text-xs">{story.event_year}</p>
        <p className="mm-muted mt-1 truncate text-xs">{story.logged_by_display_name ?? 'Contributor'}</p>
      </div>
    </Link>
  )
}
