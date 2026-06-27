import AddStoryWizard from '@/components/memory-map/AddStoryWizard'
import MemoryMapUnavailableState from '@/components/memory-map/MemoryMapUnavailableState'
import { loadContributorMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ pin?: string; area?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapAddPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { pin, area } = await searchParams
  const loaded = await loadContributorMemoryMapBundleBySlug(mapSlug)

  if (loaded.kind === 'missing') {
    return <MemoryMapUnavailableState slug={mapSlug} reason={loaded.reason} />
  }

  return (
    <AddStoryWizard
      bundle={loaded.bundle}
      dataSource={loaded.source}
      initialPinId={pin ?? null}
      initialAreaId={area ?? null}
    />
  )
}
