import type { Metadata } from 'next'
import { buildPoolShareMetadata } from '@/lib/pool-og'
import PoolJoinClient from './PoolJoinClient'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { token } = await params
  const { from } = await searchParams
  return buildPoolShareMetadata(token, { from })
}

export default function PoolJoinPage() {
  return <PoolJoinClient />
}
