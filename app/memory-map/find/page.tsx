import Link from 'next/link'
import { fetchPublicMemoryMapDirectory } from '@/lib/memory-map/directory'
import { buildFallbackDirectory } from '@/lib/memory-map/directory-types'
import MemoryMapDirectoryPanel from '@/components/memory-map/MemoryMapDirectoryPanel'

export default async function MemoryMapFindPage() {
  let directory
  try {
    directory = await fetchPublicMemoryMapDirectory()
  } catch (error) {
    console.error('[memory-map:find] page load failed', error)
    directory = buildFallbackDirectory(true)
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <Link href="/memory-map" className="mm-muted text-xs font-bold hover:text-white">
        ← Memory Map home
      </Link>
      <div className="mt-6">
        <MemoryMapDirectoryPanel
          liveEntries={directory.liveEntries}
          demoEntry={directory.demoEntry}
          directoryUnavailable={directory.directoryUnavailable}
        />
      </div>
    </main>
  )
}
