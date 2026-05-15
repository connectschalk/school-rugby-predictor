import type { Metadata } from 'next'
import OneMatchChallengePage from './OneMatchChallengeClient'
import { getOneMatchChallengeBySlug } from '@/lib/one-match-challenge-lookup'
import { buildOneMatchShareMetadata } from '@/lib/one-match-og'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return buildOneMatchShareMetadata(slug)
}

/** Renders the One Match challenge (match card, final score summary, tabs, results). */
export default async function OneMatchSlugPage({ params }: PageProps) {
  const { slug } = await params
  await getOneMatchChallengeBySlug(slug, { logContext: 'page' })
  return <OneMatchChallengePage />
}
