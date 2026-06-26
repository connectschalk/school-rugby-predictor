import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import MemoryMapLandingPage from '@/components/memory-map/MemoryMapLandingPage'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { buildMemoryMapMetadata } from '@/lib/memory-map/metadata'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ qr?: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mapSlug } = await params
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) return { title: 'Memory Map' }
  return buildMemoryMapMetadata(bundle.map)
}

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
