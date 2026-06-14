import PoolsHubPanel from '@/components/competitions/PoolsHubPanel'
import { requireCompetition } from '@/lib/competition-page-server'

type Props = { params: Promise<{ competitionSlug: string }> }

export default async function CompetitionPoolsPage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)

  return (
    <PoolsHubPanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
      competitionMode={competition.competition_mode}
    />
  )
}
