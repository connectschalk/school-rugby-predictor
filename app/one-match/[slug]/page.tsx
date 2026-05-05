import type { Metadata } from 'next'
import OneMatchChallengePage from './OneMatchChallengeClient'
import { fetchOneMatchOgBySlug, formatOneMatchKickoffOg } from '@/lib/one-match-og'
import { getPublicSiteUrl } from '@/lib/site-url'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const base = getPublicSiteUrl()
  const match = await fetchOneMatchOgBySlug(slug)
  const home_team = match?.home_team ?? 'Home'
  const away_team = match?.away_team ?? 'Away'
  const formatted_time = match ? formatOneMatchKickoffOg(match.kickoff_time) : ''
  const title = `${home_team} vs ${away_team}`
  const description = formatted_time
    ? `Kickoff: ${formatted_time}`
    : 'Predict the winner and margin. Lock in your pick.'
  const ogImageUrl = `${base}/nextplay-predictor.png`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${base}/one-match/${slug}`,
      images: [
        {
          url: ogImageUrl,
          width: 800,
          height: 240,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default function OneMatchSlugPage() {
  return <OneMatchChallengePage />
}
