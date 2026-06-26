import Link from 'next/link'
import { DEMO_MAP_ID } from '@/lib/memory-map/constants'

export default function MemoryMapAdminIndexPage() {
  return (
    <main className="mm-root mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <h1 className="text-2xl font-black">Memory Map Admin</h1>
      <p className="mm-muted mt-3 text-sm">
        Platform and school admins manage Memory Maps here. This area is not linked from the main NextPlay app.
      </p>
      <Link
        href="/memory-map/admin/create"
        className="mm-btn-primary mt-8 rounded-2xl px-5 py-4 text-center text-sm font-black"
      >
        Create new Memory Map
      </Link>
      <Link
        href={`/memory-map/admin/${DEMO_MAP_ID}`}
        className="mm-btn-secondary mt-3 rounded-2xl px-5 py-4 text-center text-sm font-bold"
      >
        Open Boishaai demo admin
      </Link>
      <Link href="/memory-map" className="mm-btn-secondary mt-3 rounded-2xl px-5 py-4 text-center text-sm font-bold">
        Back to Memory Map home
      </Link>
    </main>
  )
}
