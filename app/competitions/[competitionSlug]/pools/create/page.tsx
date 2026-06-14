import { notFound, redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import OfficialPoolCreateClient from '@/components/competitions/OfficialPoolCreateClient'
import { getCompetitionBySlug, SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

type Props = { params: Promise<{ competitionSlug: string }> }

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function CompetitionPoolCreatePage({ params }: Props) {
  const { competitionSlug } = await params
  const client = supabaseServer()
  if (!client) notFound()

  const { competition, error } = await getCompetitionBySlug(client, competitionSlug)
  if (error || !competition) notFound()

  if (competition.competition_mode === 'custom_pool_fixtures') {
    redirect(
      competitionSlug === SCHOOLS_COMPETITION_SLUG
        ? '/pools/manage'
        : `/competitions/${SCHOOLS_COMPETITION_SLUG}/pools/create`
    )
  }

  return <OfficialPoolCreateClient competition={competition} />
}
