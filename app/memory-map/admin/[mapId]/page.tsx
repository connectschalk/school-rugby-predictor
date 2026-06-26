import AdminDashboard from '@/components/memory-map/AdminDashboard'
import RequireMemoryMapAdmin from '@/components/memory-map/admin/RequireMemoryMapAdmin'

type Props = { params: Promise<{ mapId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapAdminMapPage({ params }: Props) {
  const { mapId } = await params
  return (
    <RequireMemoryMapAdmin mapId={mapId}>
      <AdminDashboard mapId={mapId} />
    </RequireMemoryMapAdmin>
  )
}
