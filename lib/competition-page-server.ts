import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import {
  competitionCardTitle,
  getCompetitionBySlug,
  type Competition,
} from '@/lib/competitions'

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function requireCompetition(slug: string): Promise<{
  competition: Competition
  title: string
}> {
  const client = supabaseServer()
  if (!client) notFound()

  const { competition, error } = await getCompetitionBySlug(client, slug)
  if (error || !competition) notFound()

  return {
    competition,
    title: competitionCardTitle(competition.slug, competition.name),
  }
}
