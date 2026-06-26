import AdminDashboard from '@/components/memory-map/AdminDashboard'

type Props = { params: Promise<{ mapId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapAdminMapPage({ params }: Props) {
  const { mapId } = await params
  return <AdminDashboard mapId={mapId} />
}
