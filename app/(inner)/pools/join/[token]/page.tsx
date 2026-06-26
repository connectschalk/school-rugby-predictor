import type { Metadata } from 'next'
import { buildPoolShareFallbackMetadata, buildPoolShareMetadata } from '@/lib/pool-og'
import PoolJoinClient from './PoolJoinClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const { token } = await params
    const { from } = await searchParams
    return await buildPoolShareMetadata(token ?? '', { from })
  } catch (err) {
    console.error('[pool-join-legacy] generateMetadata failed', err)
    return buildPoolShareFallbackMetadata()
  }
}

export default function PoolJoinPage() {
  return <PoolJoinClient />
}
