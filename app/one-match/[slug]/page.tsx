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
  const title = match ? `${home_team} vs ${away_team}` : 'One match challenge'
  const description = 'Predict the winner and margin. Lock in your pick.'
  const ogImageUrl = `${base}/api/og/one-match?slug=${encodeURIComponent(slug)}`

  return {
    title,
    description,
    openGraph: {
      title: `${home_team} vs ${away_team}`,
      description: formatted_time ? `Kickoff: ${formatted_time}` : description,
      url: `${base}/one-match/${slug}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${home_team} vs ${away_team}`,
      description: formatted_time ? `Kickoff: ${formatted_time}` : description,
      images: [ogImageUrl],
    },
  }
}

export default function OneMatchSlugPage() {
  return <OneMatchChallengePage />
}
