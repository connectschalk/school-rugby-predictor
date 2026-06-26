import { notFound } from 'next/navigation'
import StoryDetailPageClient from '@/components/memory-map/StoryDetailPageClient'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string; storyId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapStoryPage({ params }: Props) {
  const { mapSlug, storyId } = await params
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}/story/${storyId}`}>
      <StoryDetailPageClient publicBundle={bundle} storyId={storyId} mapSlug={mapSlug} />
    </MemoryMapVisibilityGate>
  )
}
