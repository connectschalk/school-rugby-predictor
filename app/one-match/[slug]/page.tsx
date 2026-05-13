import type { Metadata } from 'next'
import OneMatchChallengePage from './OneMatchChallengeClient'
import { buildOneMatchShareMetadata } from '@/lib/one-match-og'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return buildOneMatchShareMetadata(slug)
}

/** Renders the One Match challenge (match card, final score summary, tabs, results). */
export default function OneMatchSlugPage() {
  return <OneMatchChallengePage />
}
