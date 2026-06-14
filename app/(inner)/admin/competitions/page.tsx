'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { competitionLogoSrc, competitionModeBadge } from '@/lib/competition-branding'
import type { Competition } from '@/lib/competitions'
import {
  fetchAllCompetitionsForAdmin,
  fetchCompetitionAdminStats,
  type CompetitionAdminStats,
} from '@/lib/admin-competition-stats'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'

type CardData = Competition & CompetitionAdminStats

export default function AdminCompetitionsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [cards, setCards] = useState<CardData[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const { competitions, error } = await fetchAllCompetitionsForAdmin(supabase)
    if (error) {
      setMessage(error)
      setCards([])
      setLoading(false)
      return
    }

    const withStats = await Promise.all(
      competitions.map(async (c) => {
        const { stats, error: statsErr } = await fetchCompetitionAdminStats(supabase, c.id)
        if (statsErr) return { ...c, fixtureCount: 0, poolCount: 0, completedFixtureCount: 0 }
        return { ...c, ...stats }
      })
    )
    setCards(withStats)
    setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }
      const { isAdmin, error } = await fetchUserIsAdmin(supabase, session.user.id)
      if (error || !isAdmin) {
        router.replace('/predict-score')
        return
      }
      setAuthChecked(true)
      await load()
    })()
  }, [load, router])

  if (!authChecked) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center text-sm text-gray-600">
        Checking access…
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Competitions</h1>
        <p className="mt-2 text-sm text-gray-600">
          Select a competition to manage fixtures, results, pools, and settings. Uploads are always
          scoped to the selected competition.
        </p>
      </div>

      {message ? <p className="mb-4 text-sm text-red-700">{message}</p> : null}

      {loading ? (
        <p className="text-sm text-gray-600">Loading competitions…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <article
              key={c.id}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-50">
                  <Image
                    src={competitionLogoSrc(c)}
                    alt=""
                    fill
                    className="object-contain p-1"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-gray-900">{c.name}</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">{competitionModeBadge(c.competition_mode)}</p>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      c.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {c.is_active ? 'Active' : 'Draft'}
                  </span>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div>
                  <dt className="font-semibold text-gray-500">Fixtures</dt>
                  <dd className="text-lg font-bold text-gray-900">{c.fixtureCount}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-500">Pools</dt>
                  <dd className="text-lg font-bold text-gray-900">{c.poolCount}</dd>
                </div>
              </dl>
              <Link
                href={`/admin/competitions/${c.slug}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
              >
                Manage
              </Link>
            </article>
          ))}
        </div>
      )}

      {!loading && cards.length === 0 ? (
        <p className="text-sm text-gray-600">No competitions found.</p>
      ) : null}
    </main>
  )
}
