import PredictScorePanel from '@/components/competitions/PredictScorePanel'
import { requireCompetition } from '@/lib/competition-page-server'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

export default async function PredictScorePage() {
  const { competition, title } = await requireCompetition(SCHOOLS_COMPETITION_SLUG)

  return (
    <PredictScorePanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
      showProvinceFilters
    />
  )
}
