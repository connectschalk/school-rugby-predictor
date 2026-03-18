'use client'

import Link from 'next/link'

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
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <div className="flex items-start justify-between">
          <div />
          <Link
            href="/admin"
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            Admin
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-4xl text-center">
            <img
              src="/nextplay-predictor.png"
              alt="NextPlay Predictor"
              className="mx-auto h-24 w-auto md:h-28"
            />

            <h1 className="mt-6 text-4xl font-bold tracking-tight md:text-5xl">
              NextPlay Predictor
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 md:text-lg">
              School rugby insights powered by connected results, rankings, and
              visual team relationships.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-gray-200 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                >
                  <h2 className="text-xl font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                </Link>
              ))}
            </div>

            <div className="mt-8">
              <a
                href="mailto:info@thenextplay.co.za"
                className="inline-flex rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>

        <footer className="pt-8 text-center text-sm text-gray-500">
          info@thenextplay.co.za
        </footer>
      </div>
    </main>
  )
}