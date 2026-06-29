import OrganisationAdminInviteClient from '@/components/memory-map/OrganisationAdminInviteClient'
import { createMemoryMapServerClient } from '@/lib/memory-map/queries'
import { lookupOrganisationAdminInvite } from '@/lib/memory-map/organisations'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
}

export default async function OrganisationAdminInvitePage({ params }: Props) {
  const { token } = await params
  if (!token?.trim()) notFound()

  const supabase = createMemoryMapServerClient()
  if (!supabase) notFound()

  const { invite, error } = await lookupOrganisationAdminInvite(supabase, token.trim())
  if (error || !invite) notFound()

  return <OrganisationAdminInviteClient token={token.trim()} invite={invite} />
}
