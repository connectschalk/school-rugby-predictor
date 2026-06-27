import { notFound } from 'next/navigation'
import MemoryMapViewer from '@/components/memory-map/MemoryMapViewer'
import MemoryMapUnavailableState from '@/components/memory-map/MemoryMapUnavailableState'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { loadPublicMemoryMapBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ area?: string; pin?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapViewPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { area, pin } = await searchParams
  const loaded = await loadPublicMemoryMapBySlug(mapSlug)

  if (loaded.kind === 'not_found') notFound()
  if (loaded.kind === 'private') {
    return <MemoryMapUnavailableState slug={mapSlug} reason="private" />
  }

  const bundle = loaded.bundle

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}/map`}>
      <MemoryMapViewer bundle={bundle} initialAreaId={area ?? null} initialPinId={pin ?? null} />
    </MemoryMapVisibilityGate>
  )
}
