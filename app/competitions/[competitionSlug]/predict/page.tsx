import PredictScorePanel from '@/components/competitions/PredictScorePanel'
import { requireCompetition } from '@/lib/competition-page-server'

type Props = { params: Promise<{ competitionSlug: string }> }

export default async function CompetitionPredictPage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)

  return (
    <PredictScorePanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
      showProvinceFilters={competition.competition_mode === 'custom_pool_fixtures'}
    />
  )
}
