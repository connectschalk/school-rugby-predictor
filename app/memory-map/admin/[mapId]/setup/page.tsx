import AdminSetupWizard from '@/components/memory-map/admin/AdminSetupWizard'
import RequireMemoryMapAdmin from '@/components/memory-map/admin/RequireMemoryMapAdmin'

type Props = { params: Promise<{ mapId: string }> }

export const dynamic = 'force-dynamic'

export default async function MemoryMapAdminSetupPage({ params }: Props) {
  const { mapId } = await params
  return (
    <RequireMemoryMapAdmin mapId={mapId}>
      <main className="mm-root min-h-dvh">
        <AdminSetupWizard mapId={mapId} />
      </main>
    </RequireMemoryMapAdmin>
  )
}
