'use client'

import Link from 'next/link'
import RequireAdmin from '@/components/admin/RequireAdmin'

const tools = [
  {
    title: 'Predictor Prediction',
    description: 'Predict a match margin between two teams.',
    href: '/predictor',
  },
  {
    title: 'Rankings',
    description: 'View connected pool rankings for the season.',
    href: '/rankings',
  },
  {
    title: 'Consistency',
    description: 'Explore how stable team margins are across results.',
    href: '/consistency',
  },
  {
    title: 'Graph',
    description: 'Explore the team network and linked margins visually.',
    href: '/network',
  },
  {
    title: 'Scores',
    description: 'See match results and compare outcomes.',
    href: '/results',
  },
] as const

function ToolsHubContent() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Tools and Data</h1>
        <p className="mt-3 text-base text-gray-600 md:text-lg">
          Predictor, rankings, and analysis tools powered by connected school rugby results.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-3xl border border-gray-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">{item.title}</h2>
            <p className="mt-3 text-base text-gray-600">{item.description}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}

export default function ToolsPage() {
  return (
    <RequireAdmin>
      <ToolsHubContent />
    </RequireAdmin>
  )
}
