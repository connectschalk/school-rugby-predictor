'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { trackEvent } from '@/lib/trackEvent'

const navItems = [
  {
    title: 'Predict',
    description: 'Predict a match margin between two teams.',
    href: '/predictor',
  },
  {
    title: 'Results',
    description: 'See match results and compare outcomes.',
    href: '/results',
  },
  {
    title: 'Rankings',
    description: 'View connected pool rankings for the season.',
    href: '/rankings',
  },
  {
    title: 'Visual Graph',
    description: 'Explore the team network and linked margins visually.',
    href: '/network',
  },
]

export default function HomePage() {
  // 🔥 Track landing page visits
  useEffect(() => {
    trackEvent('page_view', 'landing')
  }, [])

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-5xl text-center">
            
            {/* LOGO */}
            <img
              src="/nextplay-predictor.png"
              alt="NextPlay Predictor"
              className="mx-auto h-28 w-auto md:h-36"
            />

            {/* TITLE */}
            <h1 className="mt-8 text-4xl font-bold tracking-tight md:text-5xl">
              NextPlay Predictor
            </h1>

            {/* DESCRIPTION */}
            <p className="mx-auto mt-4 max-w-3xl text-base text-gray-600 md:text-lg">
              School rugby insights powered by connected results, rankings, and visual team
              relationships.
            </p>

            {/* CARDS */}
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() =>
                    trackEvent('navigation_click', 'landing', {
                      destination: item.href,
                    })
                  }
                  className="rounded-3xl border border-gray-200 p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                >
                  <h2 className="text-2xl font-semibold">{item.title}</h2>
                  <p className="mt-3 text-base text-gray-600">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>

            {/* CONTACT BUTTON */}
            <div className="mt-10">
              <a
                href="mailto:info@thenextplay.co.za"
                onClick={() => trackEvent('contact_click', 'landing')}
                className="inline-flex rounded-2xl bg-black px-6 py-4 text-base font-medium text-white hover:opacity-90"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="pt-8 text-center">
          <div className="text-base text-gray-500">
            info@thenextplay.co.za
          </div>

          <div className="mt-5">
            <Link
              href="/admin"
              onClick={() => trackEvent('admin_click', 'landing')}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              Admin
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}