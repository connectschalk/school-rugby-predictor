import OrganisationCreateMapPanel from '@/components/memory-map/OrganisationCreateMapPanel'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ organisationSlug: string }>
}

export default async function MemoryMapOrganisationCreateMapPage({ params }: Props) {
  const { organisationSlug } = await params
  return <OrganisationCreateMapPanel organisationSlug={organisationSlug} />
}
