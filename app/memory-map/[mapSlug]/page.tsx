import { notFound } from 'next/navigation'
import MemoryMapLandingPage from '@/components/memory-map/MemoryMapLandingPage'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapPublicLandingPage({ params }: Props) {
  const { mapSlug } = await params
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}`}>
      <MemoryMapLandingPage map={bundle.map} mapSlug={mapSlug} bundle={bundle} />
    </MemoryMapVisibilityGate>
  )
}
