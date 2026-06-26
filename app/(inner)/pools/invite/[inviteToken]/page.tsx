import type { Metadata } from 'next'
import { buildPoolShareFallbackMetadata, buildPoolShareMetadata } from '@/lib/pool-og'
import PoolInviteAliasClient from './PoolInviteAliasClient'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ inviteToken: string }>
  searchParams: Promise<{ from?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const { inviteToken } = await params
    const { from } = await searchParams
    return await buildPoolShareMetadata(inviteToken ?? '', { from })
  } catch (err) {
    console.error('[pool-invite-alias] generateMetadata failed', err)
    return buildPoolShareFallbackMetadata()
  }
}

export default function PoolInviteAliasPage() {
  return <PoolInviteAliasClient />
}
