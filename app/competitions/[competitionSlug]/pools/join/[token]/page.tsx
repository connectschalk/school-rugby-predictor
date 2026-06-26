import type { Metadata } from 'next'
import { buildPoolShareMetadata } from '@/lib/pool-og'
import CompetitionPoolJoinClient from './PoolJoinClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ competitionSlug: string; token: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { competitionSlug, token } = await params
  const { from } = await searchParams
  return buildPoolShareMetadata(token, { competitionSlug, from })
}

export default function CompetitionPoolJoinPage() {
  return <CompetitionPoolJoinClient />
}
