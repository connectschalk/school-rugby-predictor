import AdminCreateMemoryMapForm from '@/components/memory-map/admin/AdminCreateMemoryMapForm'

export const dynamic = 'force-dynamic'

export default function MemoryMapAdminCreatePage() {
  return (
    <main className="mm-root min-h-dvh">
      <AdminCreateMemoryMapForm />
    </main>
  )
}
