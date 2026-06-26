import { notFound } from 'next/navigation'
import AddStoryWizard from '@/components/memory-map/AddStoryWizard'
import { fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ pin?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapAddPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { pin } = await searchParams
  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  return <AddStoryWizard bundle={bundle} initialPinId={pin ?? null} />
}
