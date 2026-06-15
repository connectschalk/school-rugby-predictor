import MyPredictionsPanel from '@/components/my-predictions/MyPredictionsPanel'
import { requireCompetition } from '@/lib/competition-page-server'

type Props = { params: Promise<{ competitionSlug: string }> }

export default async function CompetitionMyPredictionsPage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)

  return (
    <MyPredictionsPanel
      mode="competition"
      competition={{
        id: competition.id,
        slug: competition.slug,
        name: title,
        scoringMode: competition.scoring_mode,
      }}
    />
  )
}
