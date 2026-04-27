'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import CommunityPicksIcon from '@/components/icons/CommunityPicksIcon'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

function PredictIconDot() {
  return <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" aria-hidden />
}

function RankingsListIcon() {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 flex-col justify-center gap-[2px]" aria-hidden>
      <span className="h-[2px] w-full rounded-full bg-red-500" />
      <span className="h-[2px] w-full rounded-full bg-red-500" />
      <span className="h-[2px] w-full rounded-full bg-red-500" />
    </span>
  )
}

export default function HomePage() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const predictActive = pathname.startsWith('/predict-score')
  const rankingsActive = pathname.startsWith('/user-rankings')
  const communityActive = pathname.startsWith('/community-predictor') || pathname.startsWith('/community-picks')
  const activeDot = (
    <span
      className="absolute -bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-600"
      aria-hidden
    />
  )

  // 🔥 Track landing page visits
  useEffect(() => {
    trackEvent('page_view', 'landing')
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setAuthReady(true)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <section className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-4xl text-center">
            <img
              src="/nextplay-predictor.png"
              alt="School Rugby Predictor"
              className="mx-auto h-24 w-auto md:h-28"
            />
            <h1 className="mt-8 text-4xl font-black tracking-tight text-gray-900 md:text-6xl">
              Predict the margin. Climb the rankings.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 md:text-lg">
              Pick any school rugby match, predict the winning margin, and compete on accuracy.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <div className="relative flex w-full flex-col items-center pb-3 sm:w-auto">
                <Link
                  href="/predict-score"
                  onClick={() => trackEvent('navigation_click', 'landing', { destination: '/predict-score' })}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-900 bg-[#111318] px-8 py-3.5 text-base font-semibold text-white transition hover:bg-[#1a1d24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto"
                >
                  <PredictIconDot />
                  Predict
                </Link>
                {predictActive ? activeDot : null}
              </div>
              <div className="relative flex w-full flex-col items-center pb-3 sm:w-auto">
                <Link
                  href="/user-rankings"
                  onClick={() => trackEvent('navigation_click', 'landing', { destination: '/user-rankings' })}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto"
                >
                  <RankingsListIcon />
                  Rankings
                </Link>
                {rankingsActive ? activeDot : null}
              </div>
              <div className="relative flex w-full flex-col items-center pb-3 sm:w-auto">
                <Link
                  href="/community-predictor"
                  onClick={() => trackEvent('navigation_click', 'landing', { destination: '/community-predictor' })}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto"
                >
                  <CommunityPicksIcon />
                  Community Picks
                </Link>
                {communityActive ? activeDot : null}
              </div>
            </div>

            <p className="mt-12 text-center text-lg font-extrabold uppercase tracking-[0.28em] text-gray-500 md:text-xl">
              PICK - PREDICT - CLIMB
            </p>

            {authReady && !user ? (
              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500 md:text-sm">Save your picks and climb the rankings.</p>
                <p className="mt-2 text-xs text-gray-600 md:text-sm">
                  <Link
                    href="/login"
                    className="font-medium text-gray-900 underline decoration-gray-900 underline-offset-2"
                  >
                    Log in
                  </Link>{' '}
                  or{' '}
                  <Link
                    href="/signup"
                    className="font-medium text-red-700 underline decoration-red-700 underline-offset-2"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="mt-8 flex flex-col items-center justify-center gap-4 text-center">
          <a
            href="mailto:info@thenextplay.co.za"
            onClick={() => trackEvent('contact_click', 'landing')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            info@thenextplay.co.za
          </a>
        </footer>
      </div>
    </main>
  )
}