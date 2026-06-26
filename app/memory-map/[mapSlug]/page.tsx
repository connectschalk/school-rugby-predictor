import { notFound } from 'next/navigation'
import MemoryMapLandingPage from '@/components/memory-map/MemoryMapLandingPage'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapSlug: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapPublicLandingPage({ params }: Props) {
  const { mapSlug } = await params
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return <MemoryMapLandingPage map={bundle.map} mapSlug={mapSlug} />
}
