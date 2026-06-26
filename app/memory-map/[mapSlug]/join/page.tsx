import MemoryMapJoinClient from '@/components/memory-map/MemoryMapJoinClient'
import MemoryMapVisibilityGate from '@/components/memory-map/MemoryMapVisibilityGate'
import { createMemoryMapServerClient, fetchMemoryMapBundleBySlug } from '@/lib/memory-map/queries'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ mapSlug: string }>
  searchParams: Promise<{ invite?: string }>
}

export const dynamic = 'force-dynamic'

export default async function MemoryMapJoinPage({ params, searchParams }: Props) {
  const { mapSlug } = await params
  const { invite } = await searchParams
  if (!invite?.trim()) notFound()

  const bundle = await fetchMemoryMapBundleBySlug(mapSlug)
  if (!bundle) notFound()

  const supabase = createMemoryMapServerClient()
  if (!supabase) notFound()

  const { data: lookup } = await supabase.rpc('lookup_memory_map_invite', {
    p_invite_token: invite.trim(),
  })
  if (!lookup || (lookup as { map_slug?: string }).map_slug !== mapSlug) notFound()

  return (
    <MemoryMapVisibilityGate bundle={bundle} returnPath={`/memory-map/${mapSlug}/join?invite=${invite}`}>
      <MemoryMapJoinClient map={bundle.map} mapSlug={mapSlug} inviteToken={invite.trim()} />
    </MemoryMapVisibilityGate>
  )
}
