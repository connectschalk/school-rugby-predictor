import { notFound } from 'next/navigation'
import StoryDetailPageClient from '@/components/memory-map/StoryDetailPageClient'
import MemoryMapUnavailableState from '@/components/memory-map/MemoryMapUnavailableState'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { loadPublicMemoryMapBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string; storyId: string }> }

export const dynamic = 'force-dynamic'

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
