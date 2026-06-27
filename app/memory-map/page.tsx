import { fetchPublicMemoryMapDirectory } from '@/lib/memory-map/directory'
import { buildFallbackDirectory } from '@/lib/memory-map/directory-types'
import MemoryMapProductLanding from '@/components/memory-map/MemoryMapProductLanding'

export default async function MemoryMapEntryPage() {
  let directory
  try {
    directory = await fetchPublicMemoryMapDirectory()
  } catch (error) {
    console.error('[memory-map:landing] page load failed', error)
    directory = buildFallbackDirectory(true)
  }

  return <MemoryMapProductLanding directory={directory} />
}
