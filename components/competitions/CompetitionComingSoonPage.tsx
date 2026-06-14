import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getCompetitionBySlug, SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

type Props = {
  competitionSlug: string
  featureLabel: string
}

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function CompetitionComingSoonPage({ competitionSlug, featureLabel }: Props) {
  if (competitionSlug === SCHOOLS_COMPETITION_SLUG) {
    notFound()
  }

  const client = supabaseServer()
  if (!client) notFound()

  const { competition } = await getCompetitionBySlug(client, competitionSlug)
  const name = competition?.name ?? competitionSlug

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white">
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <Link href={`/competitions/${competitionSlug}`} className="text-sm text-gray-400 hover:text-white">
          ← Back to {name}
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-widest text-red-500">{featureLabel}</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">Coming soon</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-400">
          {name} is not live yet. Official fixtures and pools will open in a future update.
        </p>
        <Link
          href={`/competitions/${SCHOOLS_COMPETITION_SLUG}`}
          className="mt-8 inline-flex rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5"
        >
          Go to NextPlay Schools
        </Link>
      </div>
    </main>
  )
}
