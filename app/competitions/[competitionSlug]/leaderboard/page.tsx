import CompetitionLeaderboardPanel from '@/components/competitions/CompetitionLeaderboardPanel'
import { requireCompetition } from '@/lib/competition-page-server'

type Props = { params: Promise<{ competitionSlug: string }> }

export default async function CompetitionLeaderboardPage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)

  return (
    <CompetitionLeaderboardPanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
    />
  )
}
