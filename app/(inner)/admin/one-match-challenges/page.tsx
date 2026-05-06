'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import type { OneMatchChallengeRow, OneMatchPredictionRow } from '@/lib/one-match-challenge'
import { absoluteOneMatchChallengeUrl } from '@/lib/site-url'

/** Strip ILIKE wildcards so user input cannot broaden the pattern. */
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, '').slice(0, 80)
}

type GameMatchPick = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
}

type ChallengeListRow = OneMatchChallengeRow & {
  game_matches: GameMatchPick | GameMatchPick[] | null
}

function generateSlug(): string {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  const hex = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('')
  return `m${hex}`
}

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminOneMatchChallengesPage() {
  const router = useRouter()
  const [gate, setGate] = useState<'loading' | 'denied' | 'ok'>('loading')
  const [matchResults, setMatchResults] = useState<GameMatchPick[]>([])
  const [matchSearch, setMatchSearch] = useState('')
  const [matchListLoading, setMatchListLoading] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<string>('')
  const searchSeq = useRef(0)
  const [challenges, setChallenges] = useState<ChallengeListRow[]>([])
  const [predictionsByChallenge, setPredictionsByChallenge] = useState<Record<string, OneMatchPredictionRow[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [copyFeedback, setCopyFeedback] = useState<{ challengeId: string; status: 'copied' | 'failed' } | null>(null)
  const copyTimeoutsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        router.replace('/login')
        return
      }
      const { isAdmin, error } = await fetchUserIsAdmin(supabase, session.user.id)
      if (cancelled) return
      if (error || !isAdmin) {
        setGate('denied')
        return
      }
      setGate('ok')
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  const loadChallenges = useCallback(async () => {
    const { data, error } = await supabase
      .from('one_match_challenges')
      .select('id, match_id, slug, created_by, is_active, created_at, game_matches(id, home_team, away_team, kickoff_time, status)')
      .order('created_at', { ascending: false })
    if (error) {
      setMessage(`Could not load challenges: ${error.message}`)
      setChallenges([])
      return
    }
    setChallenges((data as ChallengeListRow[] | null) ?? [])
  }, [])

  /** Upcoming or locked fixtures still before kickoff (includes locked prestige rows). */
  const fetchPredictableMatches = useCallback(async (searchRaw: string) => {
    const iso = new Date().toISOString()
    const term = sanitizeSearchTerm(searchRaw)

    const base = () =>
      supabase
        .from('game_matches')
        .select('id, home_team, away_team, kickoff_time, status')
        .in('status', ['upcoming', 'locked'])
        .gt('kickoff_time', iso)

    if (term.length < 2) {
      const { data, error } = await base().order('kickoff_time', { ascending: true }).limit(200)
      return { data: (data as GameMatchPick[] | null) ?? [], error }
    }

    const pattern = `%${term}%`
    const [homeRes, awayRes] = await Promise.all([
      base().ilike('home_team', pattern).order('kickoff_time', { ascending: true }).limit(120),
      base().ilike('away_team', pattern).order('kickoff_time', { ascending: true }).limit(120),
    ])
    if (homeRes.error) return { data: [] as GameMatchPick[], error: homeRes.error }
    if (awayRes.error) return { data: [] as GameMatchPick[], error: awayRes.error }
    const byId = new Map<string, GameMatchPick>()
    for (const row of [...(homeRes.data ?? []), ...(awayRes.data ?? [])]) {
      byId.set(row.id, row as GameMatchPick)
    }
    const merged = [...byId.values()].sort((a, b) => +new Date(a.kickoff_time) - +new Date(b.kickoff_time))
    return { data: merged, error: null }
  }, [])

  useEffect(() => {
    if (gate !== 'ok') return
    void loadChallenges()
  }, [gate, loadChallenges])

  useEffect(() => {
    if (gate !== 'ok') return
    const seq = ++searchSeq.current
    const handle = window.setTimeout(() => {
      void (async () => {
        setMatchListLoading(true)
        const { data, error } = await fetchPredictableMatches(matchSearch)
        if (searchSeq.current !== seq) return
        if (error) {
          setMessage(`Could not load matches: ${error.message}`)
          setMatchResults([])
        } else {
          setMatchResults(data)
        }
        setMatchListLoading(false)
      })()
    }, 280)
    return () => window.clearTimeout(handle)
  }, [gate, matchSearch, fetchPredictableMatches])

  const loadPredictions = useCallback(async (challengeId: string) => {
    const { data, error } = await supabase
      .from('one_match_predictions')
      .select('id, challenge_id, display_name, predicted_winner, predicted_margin, is_locked, created_at, updated_at')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: true })
    if (error) {
      setMessage(`Could not load predictions: ${error.message}`)
      return
    }
    setPredictionsByChallenge((prev) => ({
      ...prev,
      [challengeId]: (data as OneMatchPredictionRow[]) ?? [],
    }))
  }, [])

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  useEffect(() => {
    if (!expandedId) return
    if (predictionsByChallenge[expandedId]) return
    void loadPredictions(expandedId)
  }, [expandedId, loadPredictions, predictionsByChallenge])

  useEffect(() => {
    return () => {
      for (const t of Object.values(copyTimeoutsRef.current)) {
        window.clearTimeout(t)
      }
    }
  }, [])

  async function createChallenge() {
    if (!selectedMatchId) {
      setMessage('Select a match first.')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      router.replace('/login')
      return
    }
    setCreating(true)
    setMessage('')
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = generateSlug()
      const { error } = await supabase.from('one_match_challenges').insert({
        match_id: selectedMatchId,
        slug,
        created_by: session.user.id,
        is_active: true,
      })
      if (!error) {
        setMessage('Challenge created. Copy the link below.')
        await loadChallenges()
        setCreating(false)
        return
      }
      if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
        setMessage(`Create failed: ${error.message}`)
        setCreating(false)
        return
      }
    }
    setMessage('Could not generate a unique link. Try again.')
    setCreating(false)
  }

  async function deactivate(id: string) {
    setMessage('')
    const { error } = await supabase.from('one_match_challenges').update({ is_active: false }).eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    await loadChallenges()
  }

  async function copyLink(challengeId: string, slug: string) {
    const url = absoluteOneMatchChallengeUrl(slug)
    const prevT = copyTimeoutsRef.current[challengeId]
    if (prevT) window.clearTimeout(prevT)

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('copy failed')
      }
      setCopyFeedback({ challengeId, status: 'copied' })
    } catch {
      setCopyFeedback({ challengeId, status: 'failed' })
    }

    copyTimeoutsRef.current[challengeId] = window.setTimeout(() => {
      setCopyFeedback((prev) => (prev?.challengeId === challengeId ? null : prev))
      delete copyTimeoutsRef.current[challengeId]
    }, 2000)
  }

  function pickGm(row: ChallengeListRow): GameMatchPick | null {
    const g = row.game_matches
    if (Array.isArray(g)) return g[0] ?? null
    return g
  }

  if (gate === 'loading') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-gray-600">Checking access…</p>
      </main>
    )
  }

  if (gate === 'denied') {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Access denied</h1>
        <p className="mt-3 text-sm text-gray-600">This area is only for admins.</p>
        <Link href="/predict-score" className="mt-8 inline-block rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white">
          Go to Predict a Score
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">One Match Challenges</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create a share link for a single fixture. Anyone with the link can predict without logging in until kickoff.
        </p>
      </div>

      {message ? (
        <p className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">{message}</p>
      ) : null}

      <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">New challenge</h2>
        <label className="mt-4 block text-sm font-medium text-gray-700">
          Find a match <span className="font-normal text-gray-500">(upcoming or locked, before kickoff)</span>
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. Paarl — type at least 2 letters to search the database"
          value={matchSearch}
          onChange={(e) => setMatchSearch(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-gray-500">
          With an empty search we show the next 200 fixtures. With 2+ characters we search home and away team names
          (case-insensitive).
        </p>
        {matchListLoading ? (
          <p className="mt-3 text-sm text-gray-600">Loading matches…</p>
        ) : (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50">
            {matchResults.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-600">No matches found. Try another spelling.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {matchResults.map((m) => {
                  const selected = m.id === selectedMatchId
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedMatchId(m.id)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition ${
                          selected ? 'bg-red-50 font-semibold text-red-950' : 'bg-white hover:bg-gray-100'
                        }`}
                      >
                        <span>
                          {m.home_team} <span className="font-normal text-gray-500">vs</span> {m.away_team}
                        </span>
                        <span className="text-xs font-normal text-gray-600">
                          {formatKickoff(m.kickoff_time)} · {m.status}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
        {selectedMatchId ? (
          <p className="mt-2 text-xs text-gray-600">
            {(() => {
              const sel = matchResults.find((x) => x.id === selectedMatchId)
              return sel ? (
                <>
                  Chosen: <span className="font-medium text-gray-900">{sel.home_team}</span> vs{' '}
                  <span className="font-medium text-gray-900">{sel.away_team}</span> — tap another row to change.
                </>
              ) : (
                <>Selection kept — type the same name again to highlight it, or pick from the list when it appears.</>
              )
            })()}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 sm:w-auto"
          disabled={creating || !selectedMatchId}
          onClick={() => void createChallenge()}
        >
          {creating ? 'Creating…' : 'Create challenge link'}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Your challenges</h2>
        {challenges.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No challenges yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {challenges.map((c) => {
              const gm = pickGm(c)
              const preds = predictionsByChallenge[c.id]
              return (
                <li key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {gm ? `${gm.home_team} vs ${gm.away_team}` : 'Match'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {gm ? formatKickoff(gm.kickoff_time) : ''} · {c.is_active ? 'Active' : 'Inactive'}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-gray-600">
                        {absoluteOneMatchChallengeUrl(c.slug)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={
                          copyFeedback?.challengeId === c.id && copyFeedback.status === 'copied'
                            ? 'rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700'
                            : 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50'
                        }
                        onClick={() => void copyLink(c.id, c.slug)}
                      >
                        {copyFeedback?.challengeId === c.id && copyFeedback.status === 'copied'
                          ? '✓ Copied!'
                          : copyFeedback?.challengeId === c.id && copyFeedback.status === 'failed'
                            ? 'Copy failed'
                            : 'Copy link'}
                      </button>
                      {c.is_active ? (
                        <button
                          type="button"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                          onClick={() => void deactivate(c.id)}
                        >
                          Deactivate
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                        onClick={() => toggleExpanded(c.id)}
                      >
                        {expandedId === c.id ? 'Hide predictions' : 'View predictions'}
                      </button>
                    </div>
                  </div>
                  {expandedId === c.id && preds ? (
                    <div className="mt-4 overflow-x-auto border-t border-gray-100 pt-4">
                      {preds.length === 0 ? (
                        <p className="text-sm text-gray-600">No predictions yet.</p>
                      ) : (
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500">
                              <th className="py-2 pr-4 font-medium">Name</th>
                              <th className="py-2 pr-4 font-medium">Winner</th>
                              <th className="py-2 pr-4 font-medium">Margin</th>
                              <th className="py-2 pr-4 font-medium">Locked</th>
                              <th className="py-2 font-medium">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preds.map((p) => (
                              <tr key={p.id} className="border-b border-gray-100">
                                <td className="py-2 pr-4">{p.display_name}</td>
                                <td className="py-2 pr-4">
                                  {gm ? (p.predicted_winner === 'home' ? gm.home_team : gm.away_team) : p.predicted_winner}
                                </td>
                                <td className="py-2 pr-4">{p.predicted_margin}</td>
                                <td className="py-2 pr-4 text-gray-700">{p.is_locked ? 'Yes' : 'No'}</td>
                                <td className="py-2 text-gray-600">
                                  {new Date(p.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
