import { notFound } from 'next/navigation'
import StoryDetailView from '@/components/memory-map/StoryDetailView'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string; storyId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapStoryPage({ params }: Props) {
  const { mapSlug, storyId } = await params
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  const story = bundle.stories.find((s) => s.id === storyId)
  if (!story || story.status !== 'approved') notFound()

  return <StoryDetailView bundle={bundle} story={story} />
}
