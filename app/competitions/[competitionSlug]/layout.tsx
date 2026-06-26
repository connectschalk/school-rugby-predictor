import InnerHeaderNav from '@/components/InnerHeaderNav'
import CompetitionSubNav from '@/components/competitions/CompetitionSubNav'
import { requireCompetition } from '@/lib/competition-page-server'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { isNotFoundError } from '@/lib/next-errors'

type Props = {
  children: React.ReactNode
  params: Promise<{ competitionSlug: string }>
}

export default async function CompetitionLayout({ children, params }: Props) {
  const { competitionSlug } = await params

  try {
    const { competition, title } = await requireCompetition(competitionSlug)
    const isSchools = competition.slug === SCHOOLS_COMPETITION_SLUG

    return (
      <>
        <header className="border-b border-gray-200">
          <InnerHeaderNav />
        </header>

        <CompetitionSubNav
          competitionSlug={competition.slug}
          competitionName={title}
          variant={isSchools ? 'light' : 'dark'}
        />

        {children}

        {isSchools ? (
          <footer className="mt-20 border-t border-gray-200">
            <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-gray-600">
              Contact:
              <a
                href="mailto:info@thenextplay.co.za"
                className="ml-1 text-black hover:underline"
              >
                info@thenextplay.co.za
              </a>
            </div>
          </footer>
        ) : null}
      </>
    )
  } catch (err) {
    if (isNotFoundError(err)) throw err
    console.error('[competition-layout] render failed', { competitionSlug, err })
    return (
      <>
        <header className="border-b border-gray-200">
          <InnerHeaderNav />
        </header>
        {children}
      </>
    )
  }
}
