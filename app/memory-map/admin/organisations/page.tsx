import MemoryMapAdminOrganisationsPanel from '@/components/memory-map/admin/MemoryMapAdminOrganisationsPanel'
import RequireMemoryMapPlatformAdmin from '@/components/memory-map/admin/RequireMemoryMapPlatformAdmin'

export const dynamic = 'force-dynamic'

export default function MemoryMapAdminOrganisationsPage() {
  return (
    <RequireMemoryMapPlatformAdmin returnPath="/memory-map/admin/organisations">
      <MemoryMapAdminOrganisationsPanel />
    </RequireMemoryMapPlatformAdmin>
  )
}
