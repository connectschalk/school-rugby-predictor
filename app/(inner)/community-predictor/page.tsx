'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import CommunityDistributionPanel from '@/components/community-predictor/CommunityDistributionPanel'
import {
  fetchCommunityPredictionStats,
  type CommunityStatsOk,
  type CommunityStatsResponse,
} from '@/lib/community-predictor'
import { lockAllUnlockedSavedForEditableMatches, LOCK_ALL_NO_CANDIDATES } from '@/lib/lock-user-predictions'
import { predictionCutoffPassed } from '@/lib/prediction-cutoff'
import {
  fetchGameMatchesForCommunityHub,
  fetchUserPredictionsForMatches,
  type GameMatch,
  type UserPredictionRow,
} from '@/lib/public-prediction-game'
import { matchGameAgainstTeamSearch } from '@/lib/team-aliases-db'
import type { TeamRow } from '@/lib/team-name-match'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'

const ONBOARDING_DISMISS_KEY = 'communityPicksOnboardingDismissed'

type FilterTab = 'default' | 'past' | 'upcoming' | 'all'

function predictionMap(rows: UserPredictionRow[]) {
  const m = new Map<string, UserPredictionRow>()
  for (const r of rows) {
    m.set(r.match_id, r)
  }
  return m
}

/** Kickoff still in the future (same as RPC pre-kickoff gate). */
function matchNotYetKickedOff(m: GameMatch, at: Date): boolean {
  return !predictionCutoffPassed(m, at)
}

/** Match has started — community distribution is public (kickoff_time <= now). */
function isRevealFree(m: GameMatch, at: Date): boolean {
  return predictionCutoffPassed(m, at)
}

function localYmd(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function buildDefaultOrderedMatches(matches: GameMatch[], predictions: Map<string, UserPredictionRow>, at: Date) {
  const lockedUpcoming = matches.filter((m) => !isRevealFree(m, at) && predictions.get(m.id)?.is_locked)
  const past = matches.filter((m) => isRevealFree(m, at))
  const byKick = (a: GameMatch, b: GameMatch) => +new Date(b.kickoff_time) - +new Date(a.kickoff_time)
  lockedUpcoming.sort(byKick)
  past.sort(byKick)
  const seen = new Set<string>()
  const out: GameMatch[] = []
  for (const m of lockedUpcoming) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  for (const m of past) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    out.push(m)
  }
  return out
}

function getDefaultCommunityMatch(matches: GameMatch[], at: Date): GameMatch | null {
  if (matches.length === 0) return null
  const nowMs = at.getTime()

  const live = matches
    .filter((m) => new Date(m.kickoff_time).getTime() <= nowMs && m.status !== 'completed')
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())[0]
  if (live) return live

  const nextUpcoming = matches
    .filter((m) => new Date(m.kickoff_time).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())[0]
  if (nextUpcoming) return nextUpcoming

  const mostRecentCompleted = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())[0]
  if (mostRecentCompleted) return mostRecentCompleted

  return null
}

type UnlockModalProps = {
  open: boolean
  showLockAll: boolean
  lockAllBusy: boolean
  lockAllError: string
  onDismiss: () => void
  onLockAll: () => void
}

function UnlockCommunityPicksModal({
  open,
  showLockAll,
  lockAllBusy,
  lockAllError,
  onDismiss,
  onLockAll,
}: UnlockModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 py-8"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-community-picks-title"
        className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl shadow-black/25"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          aria-label="Dismiss"
        >
          ✕
        </button>
        <div className="border-l-4 border-red-600 pl-4">
          <h2 id="unlock-community-picks-title" className="text-xl font-black tracking-tight text-gray-900">
            Unlock Community Picks
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            Lock in your predictions to see how the community is predicting upcoming games.
          </p>
        </div>
        {lockAllError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {lockAllError}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/predict-score"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Go to Predict
          </Link>
          {showLockAll ? (
            <button
              type="button"
              disabled={lockAllBusy}
              onClick={() => void onLockAll()}
              className="inline-flex flex-1 items-center justify-center rounded-xl border-2 border-red-700 bg-white px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {lockAllBusy ? 'Locking…' : 'Lock all predictions'}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full text-center text-sm font-semibold text-gray-500 hover:text-gray-800"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

export default function CommunityPicksPage() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [predictions, setPredictions] = useState<Map<string, UserPredictionRow>>(() => new Map())
  const [aliasRows, setAliasRows] = useState<Record<string, unknown>[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('default')
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState<CommunityStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const hasAutoSelectedInitial = useRef(false)
  const lastFilterTabRef = useRef<FilterTab>('default')
  /** From sessionStorage — “Not now” / backdrop / ✕ for this browser session only. */
  const [sessionOnboardingDismissed, setSessionOnboardingDismissed] = useState(false)
  const [onboardingStorageRead, setOnboardingStorageRead] = useState(false)
  /** After a successful modal “Lock all”, hide until refresh (no sessionStorage). */
  const [dismissedAfterModalLockAll, setDismissedAfterModalLockAll] = useState(false)
  const [lockAllModalBusy, setLockAllModalBusy] = useState(false)
  const [lockAllModalError, setLockAllModalError] = useState('')

  const at = useMemo(() => new Date(nowTick), [nowTick])

  useEffect(() => {
    trackEvent('page_view', 'community-picks')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSessionOnboardingDismissed(sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1')
    setOnboardingStorageRead(true)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadBase = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [gmRes, aliasRes, teamsRes] = await Promise.all([
      fetchGameMatchesForCommunityHub(supabase, 200),
      supabase.from('team_aliases').select('*'),
      supabase.from('teams').select('id, name'),
    ])
    if (gmRes.error) {
      setLoadError(gmRes.error.message)
      setMatches([])
    } else {
      setMatches(gmRes.data)
    }
    setAliasRows((aliasRes.data as Record<string, unknown>[]) ?? [])
    setTeams((teamsRes.data as TeamRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadBase()
  }, [loadBase])

  const reloadUserPreds = useCallback(async (uid: string, ids: string[]) => {
    if (ids.length === 0) {
      setPredictions(new Map())
      return new Map<string, UserPredictionRow>()
    }
    const { data, error } = await fetchUserPredictionsForMatches(supabase, uid, ids)
    if (error) {
      setLoadError(error.message)
      return new Map<string, UserPredictionRow>()
    }
    const map = predictionMap(data)
    setPredictions(map)
    return map
  }, [])

  useEffect(() => {
    if (!user || matches.length === 0) {
      if (!user) setPredictions(new Map())
      return
    }
    void reloadUserPreds(
      user.id,
      matches.map((m) => m.id)
    )
  }, [user, matches, reloadUserPreds])

  const hasUpcomingNotKickedOff = useMemo(
    () => matches.some((m) => matchNotYetKickedOff(m, at)),
    [matches, at]
  )

  const hasUnlockedUpcomingGames = useMemo(() => {
    if (!user) return false
    return matches.some((m) => {
      if (!matchNotYetKickedOff(m, at)) return false
      const p = predictions.get(m.id)
      return Boolean(p && !p.is_locked)
    })
  }, [user, matches, predictions, at])

  const showLockAllInModal = hasUnlockedUpcomingGames

  const dismissOnboardingSession = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ONBOARDING_DISMISS_KEY, '1')
    }
    setSessionOnboardingDismissed(true)
  }, [])

  const handleModalLockAll = useCallback(async () => {
    if (!user) return
    setLockAllModalError('')
    setLockAllModalBusy(true)
    const { locked, error } = await lockAllUnlockedSavedForEditableMatches(
      supabase,
      matches,
      predictions,
      new Date()
    )
    if (error?.message === LOCK_ALL_NO_CANDIDATES) {
      setLockAllModalError('Nothing to lock yet — save a pick on Predict a Score first.')
    } else if (error) {
      setLockAllModalError(error.message)
    } else {
      const nextMap = await reloadUserPreds(
        user.id,
        matches.map((m) => m.id)
      )
      const now = new Date()
      const stillUnlockedUpcoming = matches.some((m) => {
        if (!matchNotYetKickedOff(m, now)) return false
        const p = nextMap.get(m.id)
        return Boolean(p && !p.is_locked)
      })
      if (locked > 0 && !stillUnlockedUpcoming) {
        setDismissedAfterModalLockAll(true)
      }
    }
    setLockAllModalBusy(false)
  }, [user, matches, predictions, reloadUserPreds])

  const showUnlockModal =
    authReady &&
    onboardingStorageRead &&
    Boolean(user) &&
    !sessionOnboardingDismissed &&
    !dismissedAfterModalLockAll &&
    !loading &&
    !loadError &&
    hasUpcomingNotKickedOff &&
    hasUnlockedUpcomingGames

  const searchTrim = teamSearch.trim()

  const filteredByControls = useMemo(() => {
    let list = matches
    if (searchTrim) {
      list = list.filter((m) => matchGameAgainstTeamSearch(m, searchTrim, aliasRows, teams))
    }
    if (dateFilter) {
      list = list.filter((m) => localYmd(m.kickoff_time) === dateFilter)
    }
    if (filterTab === 'past') {
      list = list.filter((m) => isRevealFree(m, at))
    } else if (filterTab === 'upcoming') {
      list = list.filter((m) => !isRevealFree(m, at))
    } else if (filterTab === 'default') {
      list = buildDefaultOrderedMatches(list, predictions, at)
      return list
    }
    const byKick = (a: GameMatch, b: GameMatch) => +new Date(b.kickoff_time) - +new Date(a.kickoff_time)
    return [...list].sort(byKick)
  }, [matches, searchTrim, dateFilter, filterTab, aliasRows, teams, at, predictions])

  const orderedList = useMemo(() => {
    if (filterTab === 'default') return filteredByControls
    const byKick = (a: GameMatch, b: GameMatch) => +new Date(b.kickoff_time) - +new Date(a.kickoff_time)
    return [...filteredByControls].sort(byKick)
  }, [filteredByControls, filterTab])

  useEffect(() => {
    setIndex((i) => {
      if (orderedList.length === 0) return 0
      const switchedToDefault =
        lastFilterTabRef.current !== 'default' && filterTab === 'default'
      lastFilterTabRef.current = filterTab

      if (!hasAutoSelectedInitial.current || switchedToDefault) {
        hasAutoSelectedInitial.current = true
        const def = getDefaultCommunityMatch(orderedList, at)
        if (!def) return 0
        const idx = orderedList.findIndex((m) => m.id === def.id)
        return idx >= 0 ? idx : 0
      }
      return Math.min(i, orderedList.length - 1)
    })
  }, [orderedList, at, filterTab])

  const currentMatch = orderedList[index] ?? null

  useEffect(() => {
    if (!currentMatch) {
      setStats(null)
      return
    }
    let cancelled = false
    setStatsLoading(true)
    void fetchCommunityPredictionStats(supabase, currentMatch.id).then(({ data }) => {
      if (cancelled) return
      setStats(data)
      setStatsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentMatch?.id])

  const goPrev = () => setIndex((i) => Math.max(0, i - 1))
  const goNext = () => setIndex((i) => Math.min(Math.max(0, orderedList.length - 1), i + 1))

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    const dx = end - start
    if (dx > 48) goPrev()
    else if (dx < -48) goNext()
  }

  const tabBtn = (tab: FilterTab, label: string) => (
    <button
      key={tab}
      type="button"
      onClick={() => {
        setFilterTab(tab)
        setIndex(0)
      }}
      className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm ${
        filterTab === tab ? 'bg-gray-900 text-white' : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:max-w-4xl md:px-6 md:py-12">
      <UnlockCommunityPicksModal
        open={showUnlockModal}
        showLockAll={showLockAllInModal}
        lockAllBusy={lockAllModalBusy}
        lockAllError={lockAllModalError}
        onDismiss={dismissOnboardingSession}
        onLockAll={handleModalLockAll}
      />

      <div className="text-center md:text-left">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Community Picks</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 md:mx-0">
          After kickoff, everyone can see how the crowd split margins. Before kickoff, lock your pick on Predict a
          Score to view Community Picks for that fixture.
        </p>
      </div>

      <div className="mt-8 space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {tabBtn('default', 'Default')}
          {tabBtn('past', 'Past')}
          {tabBtn('upcoming', 'Upcoming')}
          {tabBtn('all', 'All')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-600">
              Search team
            </span>
            <input
              type="search"
              value={teamSearch}
              onChange={(e) => {
                setTeamSearch(e.target.value)
                setIndex(0)
              }}
              placeholder="School name…"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-600">
              Filter by date
            </span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value)
                setIndex(0)
              }}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            />
          </label>
        </div>
      </div>

      {!authReady ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading…</p>
      ) : loadError ? (
        <p className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>
      ) : loading ? (
        <p className="mt-10 text-center text-sm text-gray-500">Loading matches…</p>
      ) : orderedList.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-600">No matches match your filters.</p>
      ) : (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={index <= 0}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-lg font-bold text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-30"
              aria-label="Previous match"
            >
              ←
            </button>
            <p className="min-w-0 flex-1 text-center text-xs font-semibold text-gray-600 sm:text-sm">
              Match {index + 1} of {orderedList.length}
            </p>
            <button
              type="button"
              onClick={goNext}
              disabled={index >= orderedList.length - 1}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-lg font-bold text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-30"
              aria-label="Next match"
            >
              →
            </button>
          </div>

          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {statsLoading ? (
              <p className="py-16 text-center text-sm text-gray-500">Loading community picks…</p>
            ) : stats?.allowed === true ? (
              <CommunityDistributionPanel stats={stats as CommunityStatsOk} />
            ) : stats?.allowed === false && stats.reason === 'lock_required' ? (
              <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center shadow-inner">
                <p className="text-lg font-bold text-gray-900">
                  Lock your prediction to view community picks
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Save your pick on Predict a Score, then tap <strong>Lock</strong> for this fixture.
                </p>
                <Link
                  href="/predict-score"
                  className="mt-8 inline-flex rounded-2xl bg-red-700 px-8 py-3.5 text-sm font-bold text-white shadow-md hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
                >
                  Go to Predict
                </Link>
              </div>
            ) : stats?.allowed === false && stats.reason === 'not_authenticated' ? (
              <div className="rounded-3xl border border-gray-200 bg-white px-6 py-14 text-center shadow-inner">
                <p className="text-lg font-bold text-gray-900">Sign in to see Community Picks before kickoff.</p>
                <p className="mt-2 text-sm text-gray-600">
                  After kickoff, picks are public. Before kickoff, you need an account and a locked prediction.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex rounded-2xl border border-gray-900 bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-black"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex rounded-2xl border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-900 hover:bg-gray-50"
                  >
                    Sign up
                  </Link>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-gray-600">Could not load community picks.</p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
