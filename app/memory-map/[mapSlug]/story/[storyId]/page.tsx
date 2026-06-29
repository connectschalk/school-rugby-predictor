import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import StoryDetailPageClient from '@/components/memory-map/StoryDetailPageClient'
import MemoryMapUnavailableState from '@/components/memory-map/MemoryMapUnavailableState'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { buildMemoryMapMetadata } from '@/lib/memory-map/metadata'
import { loadPublicMemoryMapBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string; storyId: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mapSlug, storyId } = await params
  const loaded = await loadPublicMemoryMapBySlug(mapSlug)
  if (loaded.kind !== 'ready') return { title: 'Memory Map' }

  const base = buildMemoryMapMetadata(loaded.bundle.map)
  const story = loaded.bundle.stories.find((s) => s.id === storyId)
  if (!story) return base

  const title = `${story.title} · ${loaded.bundle.map.title}`
  return {
    ...base,
    title,
    openGraph: { ...base.openGraph, title },
    twitter: { ...base.twitter, title },
  }
}

export default async function MemoryMapStoryPage({ params }: Props) {
  const { mapSlug, storyId } = await params
  const loaded = await loadPublicMemoryMapBySlug(mapSlug)

  if (loaded.kind === 'not_found') notFound()
  if (loaded.kind === 'private') {
    return <MemoryMapUnavailableState slug={mapSlug} reason="private" />
  }

  const bundle = loaded.bundle

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}/story/${storyId}`}>
      <StoryDetailPageClient publicBundle={bundle} storyId={storyId} mapSlug={mapSlug} />
    </MemoryMapVisibilityGate>
  )
}
