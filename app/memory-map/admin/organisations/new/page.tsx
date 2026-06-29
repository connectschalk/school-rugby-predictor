import AdminOrganisationCreateForm from '@/components/memory-map/admin/AdminOrganisationCreateForm'
import RequireMemoryMapPlatformAdmin from '@/components/memory-map/admin/RequireMemoryMapPlatformAdmin'

export const dynamic = 'force-dynamic'

export default function MemoryMapAdminOrganisationNewPage() {
  return (
    <RequireMemoryMapPlatformAdmin returnPath="/memory-map/admin/organisations/new">
      <AdminOrganisationCreateForm />
    </RequireMemoryMapPlatformAdmin>
  )
}
