import { notFound } from 'next/navigation'
import MemoryMapLandingPage from '@/components/memory-map/MemoryMapLandingPage'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ qr?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapPublicLandingPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { qr } = await searchParams
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}`}>
      <MemoryMapLandingPage map={bundle.map} mapSlug={mapSlug} bundle={bundle} fromQr={qr === '1'} />
    </MemoryMapVisibilityGate>
  )
}
