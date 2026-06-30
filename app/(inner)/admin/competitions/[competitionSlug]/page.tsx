'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import CompetitionFixturesPanel from '@/components/admin/CompetitionFixturesPanel'
import CompetitionResultsPanel from '@/components/admin/CompetitionResultsPanel'
import { competitionLogoSrc, competitionModeBadge } from '@/lib/competition-branding'
import type { Competition } from '@/lib/competitions'
import { getCompetitionBySlug } from '@/lib/competitions'
import {
  fetchCompetitionAdminStats,
  fetchCompetitionFixtures,
  fetchCompetitionPools,
  type AdminFixtureRow,
  type AdminPoolRow,
  type CompetitionAdminStats,
} from '@/lib/admin-competition-stats'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'

type TabId = 'overview' | 'fixtures' | 'results' | 'pools' | 'leaderboard' | 'settings'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'results', label: 'Results' },
  { id: 'pools', label: 'Pools' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'settings', label: 'Settings' },
]

export default function AdminCompetitionDashboardPage() {
  const params = useParams()
  const router = useRouter()
  const competitionSlug = String(params.competitionSlug ?? '').trim().toLowerCase()

  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState<TabId>('overview')
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [stats, setStats] = useState<CompetitionAdminStats | null>(null)
  const [fixtures, setFixtures] = useState<AdminFixtureRow[]>([])
  const [pools, setPools] = useState<AdminPoolRow[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!competitionSlug) return
    if (!opts?.silent) setLoading(true)
    if (!opts?.silent) setMessage('')
    const { competition: comp, error: compErr } = await getCompetitionBySlug(supabase, competitionSlug)
    if (compErr || !comp) {
      setMessage(compErr ?? 'Competition not found')
      setCompetition(null)
      setLoading(false)
      return
    }
    setCompetition(comp)

    const [statsRes, fixturesRes, poolsRes] = await Promise.all([
      fetchCompetitionAdminStats(supabase, comp.id),
      fetchCompetitionFixtures(supabase, comp.id),
      fetchCompetitionPools(supabase, comp.id),
    ])

    if (statsRes.error) setMessage(statsRes.error)
    setStats(statsRes.stats)
    if (fixturesRes.error) setMessage(fixturesRes.error)
    else setFixtures(fixturesRes.fixtures)
    if (poolsRes.error) setMessage(poolsRes.error)
    else setPools(poolsRes.pools)
    if (!opts?.silent) setLoading(false)
  }, [competitionSlug])

  const refreshData = useCallback(() => loadData({ silent: true }), [loadData])

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
      await loadData()
    })()
  }, [loadData, router])

  if (!authChecked) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center text-sm text-gray-600">
        Checking access…
      </main>
    )
  }

  if (!competition && !loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-gray-900">Competition not found</h1>
        <Link href="/admin/competitions" className="mt-4 inline-block text-sm font-semibold text-red-700 underline">
          Back to competitions
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link href="/admin/competitions" className="text-xs font-semibold text-gray-500 hover:text-gray-800">
          ← All competitions
        </Link>
      </div>

      {competition ? (
        <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-50">
            <Image
              src={competitionLogoSrc(competition)}
              alt=""
              fill
              className="object-contain p-1.5"
              sizes="64px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Managing</p>
            <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
            <p className="mt-1 text-sm text-gray-600">
              <code className="rounded bg-gray-100 px-1">{competition.slug}</code>
              {' · '}
              {competitionModeBadge(competition.competition_mode)}
              {' · '}
              {competition.is_active ? 'Active' : 'Draft'}
            </p>
          </div>
        </header>
      ) : null}

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border border-b-0 border-gray-200 bg-white text-gray-900'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {message ? <p className="mb-4 text-sm text-red-700">{message}</p> : null}
      {loading ? <p className="text-sm text-gray-600">Loading…</p> : null}

      {!loading && tab === 'overview' && stats ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Fixtures" value={stats.fixtureCount} />
          <StatCard label="Completed" value={stats.completedFixtureCount} />
          <StatCard label="Pools" value={stats.poolCount} />
          {competition?.description ? (
            <p className="sm:col-span-3 text-sm text-gray-600">{competition.description}</p>
          ) : null}
        </section>
      ) : null}

      {!loading && tab === 'fixtures' ? (
        <CompetitionFixturesPanel
          competitionSlug={competitionSlug}
          fixtures={fixtures}
          onRefresh={refreshData}
        />
      ) : null}

      {!loading && tab === 'results' ? (
        <CompetitionResultsPanel
          competitionSlug={competitionSlug}
          scoringMode={competition?.scoring_mode ?? 'rugby_margin'}
          fixtures={fixtures}
          onRefresh={refreshData}
        />
      ) : null}

      {!loading && tab === 'pools' ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">Pools ({pools.length})</h3>
          {pools.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No pools for this competition yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {pools.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.is_closed ? 'Closed' : 'Open'}</p>
                  </div>
                  <Link
                    href={`/pools/${p.id}/manage`}
                    className="text-xs font-semibold text-red-700 underline"
                  >
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-gray-500">
            Global pool search:{' '}
            <Link href="/admin/global-pools" className="font-semibold text-red-700 underline">
              /admin/global-pools
            </Link>
          </p>
        </section>
      ) : null}

      {!loading && tab === 'leaderboard' && competition ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">Leaderboard</h3>
          <p className="mt-2 text-sm text-gray-600">
            Public competition leaderboard is scoped to this competition&apos;s pools and predictions.
          </p>
          <Link
            href={`/competitions/${competition.slug}/leaderboard`}
            className="mt-4 inline-flex rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
          >
            View public leaderboard
          </Link>
        </section>
      ) : null}

      {!loading && tab === 'settings' && competition ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">Settings</h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-gray-500">Slug</dt>
              <dd>{competition.slug}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-500">Sport</dt>
              <dd>{competition.sport_type}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-500">Mode</dt>
              <dd>{competition.competition_mode}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-500">Status</dt>
              <dd>{competition.is_active ? 'Active' : 'Draft (inactive)'}</dd>
            </div>
          </dl>
          {competition.slug === 'nextplay-schools' ? (
            <p className="mt-4 text-xs text-gray-500">
              Legacy fixture tools:{' '}
              <Link href="/admin/game-matches" className="font-semibold text-red-700 underline">
                /admin/game-matches
              </Link>
              ,{' '}
              <Link href="/admin" className="font-semibold text-red-700 underline">
                /admin hub
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
