import OrganisationDashboardPanel from '@/components/memory-map/OrganisationDashboardPanel'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ organisationSlug: string }>
}

export default async function MemoryMapOrganisationDashboardPage({ params }: Props) {
  const { organisationSlug } = await params
  return <OrganisationDashboardPanel organisationSlug={organisationSlug} />
}
