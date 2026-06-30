import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import CompetitionPoolActions from '@/components/competitions/CompetitionPoolActions'
import {
  competitionHeroSrc,
  competitionLogoSrc,
  competitionModeBadge,
  competitionTagline,
  isOfficialCompetition,
} from '@/lib/competition-branding'
import { requireCompetition, supabaseServer } from '@/lib/competition-page-server'
import { SUPABASE_PUBLIC } from '@/lib/supabase-public-access'

type Props = {
  params: Promise<{ competitionSlug: string }>
}

export default async function CompetitionHomePage({ params }: Props) {
  const { competitionSlug } = await params
  const { competition, title } = await requireCompetition(competitionSlug)
  const client = supabaseServer()
  if (!client) notFound()

  const logoSrc = competitionLogoSrc(competition)
  const heroSrc = competitionHeroSrc(competition)
  const tagline = competitionTagline(competition.slug)
  const modeBadge = competitionModeBadge(competition.competition_mode)
  const official = isOfficialCompetition(competition.competition_mode)
  const base = `/competitions/${competition.slug}`

  const { count: fixtureCount } = await client
    .from(SUPABASE_PUBLIC.gameMatches)
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competition.id)

  const hasFixtures = (fixtureCount ?? 0) > 0

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white">
      {heroSrc ? (
        <div className="relative h-40 w-full overflow-hidden border-b border-white/10 sm:h-52">
          <Image src={heroSrc} alt="" fill className="object-cover opacity-60" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0b]" />
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/"
          className="text-sm font-medium text-gray-400 transition hover:text-white"
        >
          ← All competitions
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto inline-flex rounded-2xl bg-white px-8 py-6 shadow-lg shadow-black/30 sm:px-10 sm:py-8">
            <Image
              src={logoSrc}
              alt=""
              width={360}
              height={108}
              priority
              className="h-20 w-auto max-w-[min(100%,360px)] object-contain sm:h-24"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                official
                  ? 'bg-red-600/20 text-red-400 ring-1 ring-red-600/40'
                  : 'bg-white/5 text-gray-300 ring-1 ring-white/15'
              }`}
            >
              {modeBadge}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-white/10">
              {competition.sport_type}
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold text-red-400">{tagline}</p>
          {competition.description ? (
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-gray-400">
              {competition.description}
            </p>
          ) : null}

          {official && !hasFixtures ? (
            <p className="mx-auto mt-6 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
              Fixtures will appear here once loaded by NextPlay.
            </p>
          ) : null}
        </div>

        <div className="mt-10 space-y-3">
          <Link
            href={`${base}/predict`}
            className="block w-full rounded-2xl border border-red-600/40 bg-red-600 px-6 py-4 text-center text-sm font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-700"
          >
            Predict
          </Link>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={`${base}/leaderboard`}
              className="rounded-2xl border border-white/10 bg-[#111318] px-6 py-4 text-center text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[#161a22]"
            >
              Leaderboard
            </Link>
            <Link
              href={`${base}/fixtures`}
              className="rounded-2xl border border-white/10 bg-[#111318] px-6 py-4 text-center text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[#161a22]"
            >
              Fixtures
            </Link>
          </div>

          <Link
            href={`${base}/pools`}
            className="block w-full rounded-2xl border border-white/10 bg-[#111318] px-6 py-4 text-center text-sm font-semibold text-white transition hover:border-white/20 hover:bg-[#161a22]"
          >
            My pools
          </Link>
        </div>

        <Suspense
          fallback={
            <div className="mt-6 h-48 animate-pulse rounded-2xl border border-white/10 bg-[#111318]" />
          }
        >
          <CompetitionPoolActions
            competitionSlug={competition.slug}
            competitionName={title}
            competitionId={competition.id}
          />
        </Suspense>
      </div>
    </main>
  )
}
