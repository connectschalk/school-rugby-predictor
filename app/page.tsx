'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  competitionLogoSrc,
  competitionModeBadge,
  competitionTagline,
} from '@/lib/competition-branding'
import {
  PLATFORM_LOGO_LANDING_DARK_SRC,
  PLATFORM_NAME,
} from '@/lib/platform-branding'
import {
  competitionCardTitle,
  getActiveCompetitions,
  type Competition,
} from '@/lib/competitions'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

const FALLBACK_COMPETITIONS: Competition[] = [
  {
    id: 'fallback-schools',
    slug: 'nextplay-schools',
    name: 'NextPlay Schools',
    description:
      'Build your own school rugby pool. Choose your teams, invite your people, and follow the rankings.',
    logo_url: '/competition-logos/school-rugby-predictor.png',
    hero_image_url: null,
    sport_type: 'rugby',
    competition_mode: 'custom_pool_fixtures',
    scoring_mode: 'rugby_margin',
    is_active: true,
    display_order: 1,
  },
  {
    id: 'fallback-craven',
    slug: 'craven-week',
    name: 'NextPlay Craven Week',
    description:
      'Predict the official Craven Week fixtures. Invite your group and compete on every match.',
    logo_url: '/competition-logos/craven-week-rugby-predictor.png',
    hero_image_url: null,
    sport_type: 'rugby',
    competition_mode: 'official_fixed_fixtures',
    scoring_mode: 'rugby_margin',
    is_active: true,
    display_order: 2,
  },
  {
    id: 'fallback-soccer',
    slug: 'soccer-world-cup',
    name: 'NextPlay Soccer World Cup',
    description:
      'Create your World Cup pool and predict every match with your friends.',
    logo_url: '/competition-logos/soccer-world-cup-predictor.png',
    hero_image_url: null,
    sport_type: 'soccer',
    competition_mode: 'official_fixed_fixtures',
    scoring_mode: 'soccer_exact_score',
    is_active: true,
    display_order: 3,
  },
]

function CompetitionCard({ competition }: { competition: Competition }) {
  const title = competitionCardTitle(competition.slug, competition.name)
  const logoSrc = competitionLogoSrc(competition)
  const tagline = competitionTagline(competition.slug)
  const modeBadge = competitionModeBadge(competition.competition_mode)
  const isOfficial = competition.competition_mode === 'official_fixed_fixtures'

  return (
    <Link
      href={`/competitions/${competition.slug}`}
      onClick={() =>
        trackEvent('navigation_click', 'landing', {
          destination: `/competitions/${competition.slug}`,
          competition: competition.slug,
        })
      }
      className="group flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111318] text-left shadow-lg shadow-black/40 transition hover:border-red-600/50 hover:bg-[#161a22] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
    >
      <div className="border-b border-white/5 bg-white px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex h-14 items-center sm:h-16">
          <Image
            src={logoSrc}
            alt=""
            width={220}
            height={64}
            className="h-11 w-auto max-w-full object-contain object-left sm:h-12"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isOfficial
                ? 'bg-red-600/20 text-red-400 ring-1 ring-red-600/30'
                : 'bg-white/5 text-gray-400 ring-1 ring-white/10'
            }`}
          >
            {modeBadge}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {competition.sport_type}
          </span>
        </div>

        <h2 className="mt-4 text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm font-semibold text-red-400">{tagline}</p>
        {competition.description ? (
          <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-400">{competition.description}</p>
        ) : (
          <div className="flex-1" />
        )}

        <span className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-red-700 sm:w-auto sm:justify-start">
          Enter {title.split(' ')[0]}
        </span>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [competitions, setCompetitions] = useState<Competition[]>(FALLBACK_COMPETITIONS)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    trackEvent('page_view', 'landing')
  }, [])

  useEffect(() => {
    let cancelled = false
    void getActiveCompetitions(supabase).then(({ competitions: rows, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error)
        return
      }
      if (rows.length > 0) setCompetitions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10 sm:px-6">
        <header className="flex flex-col items-center text-center">
          <Image
            src={PLATFORM_LOGO_LANDING_DARK_SRC}
            alt={PLATFORM_NAME}
            width={1024}
            height={467}
            priority
            sizes="(max-width: 640px) 280px, (max-width: 1024px) 320px, 360px"
            className="mx-auto h-auto w-full max-w-[280px] object-contain py-8 sm:max-w-[320px] sm:py-10 lg:max-w-[360px]"
          />
          <h1 className="max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            Choose your NextPlay environment
          </h1>
          <p className="mt-4 max-w-xl text-sm text-gray-400 sm:text-base">
            Three competitions. Three doors. Pick yours, create a pool, and predict every margin.
          </p>
        </header>

        <section className="mt-12 grid flex-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {competitions.map((c) => (
            <CompetitionCard key={c.id} competition={c} />
          ))}
        </section>

        {loadError ? (
          <p className="mt-4 text-center text-xs text-amber-400/90">
            Showing default competitions (could not load from server).
          </p>
        ) : null}

        <footer className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-gray-500">
          <Link href="/login" className="text-gray-400 underline-offset-2 hover:text-white hover:underline">
            Log in
          </Link>
          <a href="mailto:info@thenextplay.co.za" className="hover:text-gray-300">
            info@thenextplay.co.za
          </a>
        </footer>
      </div>
    </main>
  )
}
