import { notFound } from 'next/navigation'
import MemoryMapViewer from '@/components/memory-map/MemoryMapViewer'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ area?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapViewPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { area } = await searchParams
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return <MemoryMapViewer bundle={bundle} initialAreaId={area ?? null} />
}
