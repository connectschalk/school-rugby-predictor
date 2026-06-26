import type { Metadata } from 'next'
import { buildPoolShareMetadata } from '@/lib/pool-og'
import PoolInviteAliasClient from './PoolInviteAliasClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ inviteToken: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { inviteToken } = await params
  const { from } = await searchParams
  return buildPoolShareMetadata(inviteToken, { from })
}

export default function PoolInviteAliasPage() {
  return <PoolInviteAliasClient />
}
