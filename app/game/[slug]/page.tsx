import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { buildOneMatchShareMetadata } from '@/lib/one-match-og'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return buildOneMatchShareMetadata(slug)
}

export default async function GameSlugAliasPage({ params }: PageProps) {
  const { slug } = await params
  permanentRedirect(`/one-match/${encodeURIComponent(decodeURIComponent(slug))}`)
}
