'use client'

import Link from 'next/link'
import type { MemoryMapBundle, MemoryStory } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import StoryCard from '@/components/memory-map/StoryCard'

type Props = {
  bundle: MemoryMapBundle
  story: MemoryStory
}

export default function StoryDetailView({ bundle, story }: Props) {
  const { map, stories } = bundle
  const related = stories.filter((s) => s.pin_id === story.pin_id && s.id !== story.id && s.status === 'approved')
  const media = story.media ?? []

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}/map`} />

      <article className="mx-auto max-w-lg px-4 py-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">{story.event_year}</p>
        <h1 className="mt-2 text-2xl font-black">{story.title}</h1>
        <p className="mm-muted mt-2 text-sm">Logged by {story.logged_by_display_name ?? 'Contributor'}</p>

        <div className="mt-6 overflow-hidden rounded-2xl bg-black/40">
          {media.length > 0 && media[0]?.media_type === 'video' ? (
            <div className="flex aspect-video items-center justify-center text-sm text-white/50">Video player placeholder</div>
          ) : media.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media[0]!.file_url} alt="" className="w-full object-cover" />
          ) : (
            <div className="p-6 text-sm leading-relaxed text-white/80">{story.description}</div>
          )}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-white/90">{story.description}</p>

        {story.tags && story.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {story.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {map.sponsor_name ? (
          <p className="mm-muted mt-8 text-center text-xs">Proudly sponsored by {map.sponsor_name}</p>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-black uppercase tracking-wide">More at this place</h2>
            <div className="mt-3 space-y-3">
              {related.map((s) => (
                <StoryCard key={s.id} story={s} mapSlug={map.slug} />
              ))}
            </div>
          </section>
        ) : null}

        <Link href={`/memory-map/${map.slug}/add?pin=${story.pin_id}`} className="mm-btn-primary mt-8 block rounded-2xl px-4 py-3 text-center text-sm font-black">
          Add another memory here
        </Link>
      </article>
    </div>
  )
}
