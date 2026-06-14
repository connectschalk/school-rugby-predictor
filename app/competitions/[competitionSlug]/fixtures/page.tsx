import CompetitionFixturesPanel from '@/components/competitions/CompetitionFixturesPanel'
import { requireCompetition } from '@/lib/competition-page-server'

type Props = { params: Promise<{ competitionSlug: string }> }

export default async function CompetitionFixturesPage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)

  return (
    <CompetitionFixturesPanel
      competitionId={competition.id}
      competitionSlug={competition.slug}
      competitionName={title}
      showProvinceFilters={competition.competition_mode === 'custom_pool_fixtures'}
    />
  )
}
