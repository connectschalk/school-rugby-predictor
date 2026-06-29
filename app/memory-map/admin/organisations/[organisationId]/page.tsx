import AdminOrganisationDetailPanel from '@/components/memory-map/admin/AdminOrganisationDetailPanel'
import RequireMemoryMapPlatformAdmin from '@/components/memory-map/admin/RequireMemoryMapPlatformAdmin'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ organisationId: string }>
}

export default async function MemoryMapAdminOrganisationDetailPage({ params }: Props) {
  const { organisationId } = await params
  return (
    <RequireMemoryMapPlatformAdmin returnPath={`/memory-map/admin/organisations/${organisationId}`}>
      <AdminOrganisationDetailPanel organisationId={organisationId} />
    </RequireMemoryMapPlatformAdmin>
  )
}
