import PoolsHubPanel from '@/components/competitions/PoolsHubPanel'
import { requireCompetition } from '@/lib/competition-page-server'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

export default async function PoolsPage() {
  const { competition, title } = await requireCompetition(SCHOOLS_COMPETITION_SLUG)

  return (
    <PoolsHubPanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
      competitionMode={competition.competition_mode}
    />
  )
}
