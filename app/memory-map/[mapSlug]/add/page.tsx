import { notFound } from 'next/navigation'
import AddStoryWizard from '@/components/memory-map/AddStoryWizard'
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
  if (!loaded) notFound()

  return (
    <AddStoryWizard
      bundle={loaded.bundle}
      dataSource={loaded.source}
      initialPinId={pin ?? null}
      initialAreaId={area ?? null}
    />
  )
}
