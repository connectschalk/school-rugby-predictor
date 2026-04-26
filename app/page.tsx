'use client'

import Link from 'next/link'
import { useEffect } from 'react'
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
  // 🔥 Track landing page visits
  useEffect(() => {
    trackEvent('page_view', 'landing')
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
              <Link
                href="/predict-score"
                onClick={() => trackEvent('navigation_click', 'landing', { destination: '/predict-score' })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-900 bg-[#111318] px-8 py-3.5 text-base font-semibold text-white transition hover:bg-[#1a1d24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto"
              >
                <PredictIconDot />
                Predict
              </Link>
              <Link
                href="/user-rankings"
                onClick={() => trackEvent('navigation_click', 'landing', { destination: '/user-rankings' })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-8 py-3.5 text-base font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:w-auto"
              >
                <RankingsListIcon />
                Rankings
              </Link>
            </div>

            <p className="mt-12 text-center text-lg font-extrabold uppercase tracking-[0.28em] text-gray-500 md:text-xl">
              PICK - PREDICT - CLIMB
            </p>
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