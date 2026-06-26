import type { Metadata } from 'next'
import { buildPoolShareFallbackMetadata, buildPoolShareMetadata } from '@/lib/pool-og'
import CompetitionPoolJoinClient from './PoolJoinClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ competitionSlug: string; token: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const { competitionSlug, token } = await params
    const { from } = await searchParams
    return await buildPoolShareMetadata(token ?? '', { competitionSlug, from })
  } catch (err) {
    console.error('[pool-join] generateMetadata failed', err)
    return buildPoolShareFallbackMetadata()
  }
}

export default function CompetitionPoolJoinPage() {
  return <CompetitionPoolJoinClient />
}
