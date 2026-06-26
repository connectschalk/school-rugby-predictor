import { notFound } from 'next/navigation'
import AdminDashboard from '@/components/memory-map/AdminDashboard'
import { DEMO_MEMORY_MAP_BUNDLE, enrichBundle } from '@/lib/memory-map/demo-data'
import { fetchAdminMemoryMapBundle } from '@/lib/memory-map/queries'

type Props = { params: Promise<{ mapId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapAdminMapPage({ params }: Props) {
  const { mapId } = await params
  const fromDb = await fetchAdminMemoryMapBundle(mapId)
  const bundle =
    fromDb ??
    (mapId === DEMO_MEMORY_MAP_BUNDLE.map.id
      ? enrichBundle({ ...DEMO_MEMORY_MAP_BUNDLE, stories: [...DEMO_MEMORY_MAP_BUNDLE.stories] })
      : null)

  if (!bundle) notFound()

  return <AdminDashboard bundle={bundle} />
}
