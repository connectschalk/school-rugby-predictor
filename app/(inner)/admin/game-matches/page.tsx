'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin-email'
import { parseGameMatchesBulk, parseGameMatchesCsv } from '@/lib/parse-game-matches-bulk'
import type { GameMatch, GameMatchStatus } from '@/lib/public-prediction-game'

export default function AdminGameMatchesPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [fixtures, setFixtures] = useState<GameMatch[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [completeDraft, setCompleteDraft] = useState<Record<string, { home: string; away: string }>>({})
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const loadFixtures = useCallback(async () => {
    setLoadingList(true)
    const { data, error } = await supabase
      .from('game_matches')
      .select('id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at')
      .order('kickoff_time', { ascending: false })

    if (error) {
      setMessage(`Could not load fixtures: ${error.message}`)
      setFixtures([])
    } else {
      setFixtures((data as GameMatch[]) ?? [])
    }
    setLoadingList(false)
  }, [])

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const email = session?.user?.email ?? ''
      if (!session || email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.push('/login')
        return
      }
      setAuthChecked(true)
    }

    checkAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? ''
      if (!session || email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    if (!authChecked) return
    void loadFixtures()
  }, [authChecked, loadFixtures])

  async function submitBulk() {
    setMessage('')
    setValidationErrors([])

    let csvText = ''
    if (csvFile) {
      try {
        csvText = await csvFile.text()
      } catch {
        setMessage('Could not read the CSV file.')
        return
      }
    }

    const fromTextarea = parseGameMatchesBulk(bulkText)
    const fromCsv = csvText ? parseGameMatchesCsv(csvText) : []
    const errors = [
      ...fromTextarea.filter((p) => !p.ok).map((p) => `Textarea line ${p.lineNumber}: ${p.error}`),
      ...fromCsv.filter((p) => !p.ok).map((p) => `CSV line ${p.lineNumber}: ${p.error}`),
    ]
    const valid = [...fromTextarea.filter((p) => p.ok), ...fromCsv.filter((p) => p.ok)]

    setValidationErrors(errors)

    if (valid.length === 0) {
      setMessage('No valid rows to insert (check textarea and CSV).')
      return
    }

    setSubmitting(true)
    const rows = valid.map((p) => ({
      home_team: p.home_team,
      away_team: p.away_team,
      kickoff_time: p.kickoff_time,
      status: 'upcoming' as const,
    }))

    const { data: inserted, error } = await supabase.from('game_matches').insert(rows).select('id')

    if (error) {
      setMessage(`Insert failed: ${error.message}`)
      setSubmitting(false)
      return
    }

    const insertedCount = inserted?.length ?? valid.length
    setMessage(`Inserted ${insertedCount} game(s).`)

    let emailNote = ''
    if (insertedCount > 0) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        const res = await fetch('/api/admin/notify-new-games', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = (await res.json()) as { ok?: boolean; message?: string; error?: string }
        if (!res.ok || !json.ok) {
          emailNote = ` Email notify failed: ${json.error ?? res.statusText}`
        } else if (json.message) {
          emailNote = ` ${json.message}`
        }
      } else {
        emailNote = ' Not signed in — skipped email notify.'
      }
    }

    setMessage((m) => m + emailNote)
    setBulkText('')
    setCsvFile(null)
    if (csvInputRef.current) csvInputRef.current.value = ''
    await loadFixtures()
    setSubmitting(false)
  }

  async function setStatus(id: string, status: GameMatchStatus, scores?: { home: number; away: number }) {
    setRowBusyId(id)
    const patch: Record<string, unknown> = { status }
    if (status === 'upcoming') {
      patch.home_score = null
      patch.away_score = null
    }
    if (status === 'completed' && scores) {
      patch.home_score = scores.home
      patch.away_score = scores.away
    }

    const { error } = await supabase.from('game_matches').update(patch).eq('id', id)
    if (error) {
      setMessage(`Update failed: ${error.message}`)
    }
    await loadFixtures()
    setRowBusyId(null)
  }

  async function runScoring(id: string) {
    setRowBusyId(id)
    const { data, error } = await supabase.rpc('score_predictions_for_match', { p_match_id: id })
    if (error) {
      setMessage(`Scoring failed: ${error.message}`)
    } else {
      setMessage(`Scoring wrote ${data ?? 0} row(s) for this match.`)
    }
    await loadFixtures()
    setRowBusyId(null)
  }

  async function deleteMatch(id: string) {
    if (!window.confirm('Delete this fixture and related predictions/comments?')) return
    setRowBusyId(id)
    const { error } = await supabase.from('game_matches').delete().eq('id', id)
    if (error) {
      setMessage(`Delete failed: ${error.message}`)
    }
    await loadFixtures()
    setRowBusyId(null)
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p>Checking access...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Predict a Score — fixtures</h1>
            <p className="mt-1 text-sm text-gray-600">
              Admin only ({ADMIN_EMAIL}).{' '}
              <Link href="/admin" className="text-blue-600 underline hover:text-blue-800">
                Back to admin
              </Link>
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold">Bulk add upcoming games</h2>
          <p className="mt-2 text-sm text-gray-600">
            Paste fixtures or upload CSV. Kickoff time is optional. When omitted, kickoff is set to the{' '}
            <strong>coming Saturday at 15:00</strong> in your local timezone (same default for every row in
            this submit). Explicit times use <code className="text-xs">YYYY-MM-DD HH:mm</code> in local time.
          </p>
          <textarea
            className="mt-4 w-full min-h-[160px] rounded-lg border border-gray-300 p-3 font-mono text-sm"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Grey College vs Paul Roos\nPaarl Gimnasium vs Affies\nStellenberg, Durbanville`}
            disabled={submitting}
          />
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-800">CSV upload (optional)</label>
            <p className="mt-1 text-xs text-gray-600">
              Headers: <code className="text-xs">home_team,away_team</code> or{' '}
              <code className="text-xs">home_team,away_team,kickoff_time</code>. Rows without{' '}
              <code className="text-xs">kickoff_time</code> use the same default Saturday 15:00.
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="mt-2 block w-full max-w-md text-sm"
              disabled={submitting}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setCsvFile(f)
              }}
            />
            {csvFile && (
              <p className="mt-1 text-xs text-gray-600">
                Selected: {csvFile.name}{' '}
                <button
                  type="button"
                  className="text-blue-600 underline"
                  onClick={() => {
                    setCsvFile(null)
                    if (csvInputRef.current) csvInputRef.current.value = ''
                  }}
                >
                  Clear
                </button>
              </p>
            )}
          </div>
          {validationErrors.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-sm text-red-700">
              {validationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {message && <p className="mt-3 text-sm text-gray-800">{message}</p>}
          <button
            type="button"
            onClick={() => void submitBulk()}
            disabled={submitting}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Insert valid games & notify'}
          </button>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Current fixtures</h2>
          {loadingList ? (
            <p className="mt-4 text-sm text-gray-600">Loading…</p>
          ) : fixtures.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No rows in game_matches yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="py-2 pr-3">Home</th>
                    <th className="py-2 pr-3">Away</th>
                    <th className="py-2 pr-3">Kickoff</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Scores</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((m) => {
                    const busy = rowBusyId === m.id
                    const draft = completeDraft[m.id] ?? { home: '', away: '' }
                    return (
                      <tr key={m.id} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-3">{m.home_team}</td>
                        <td className="py-2 pr-3">{m.away_team}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(m.kickoff_time).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3">{m.status}</td>
                        <td className="py-2 pr-3">
                          {m.home_score ?? '—'} – {m.away_score ?? '—'}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                                onClick={() => void setStatus(m.id, 'upcoming')}
                              >
                                Mark upcoming
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                                onClick={() => void setStatus(m.id, 'locked')}
                              >
                                Mark locked
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                placeholder="Home"
                                className="w-16 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                value={draft.home}
                                onChange={(e) =>
                                  setCompleteDraft((d) => ({
                                    ...d,
                                    [m.id]: { ...draft, home: e.target.value },
                                  }))
                                }
                              />
                              <input
                                type="number"
                                placeholder="Away"
                                className="w-16 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                value={draft.away}
                                onChange={(e) =>
                                  setCompleteDraft((d) => ({
                                    ...d,
                                    [m.id]: { ...draft, away: e.target.value },
                                  }))
                                }
                              />
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded bg-gray-800 px-2 py-1 text-xs text-white hover:bg-gray-900 disabled:opacity-50"
                                onClick={() => {
                                  const hs = Number(draft.home)
                                  const as = Number(draft.away)
                                  if (!Number.isFinite(hs) || !Number.isFinite(as)) {
                                    setMessage('Enter numeric home and away scores to complete.')
                                    return
                                  }
                                  void setStatus(m.id, 'completed', { home: hs, away: as })
                                }}
                              >
                                Save result & completed
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={busy || m.status !== 'completed'}
                              className="w-fit rounded border border-blue-600 px-2 py-1 text-xs text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                              onClick={() => void runScoring(m.id)}
                            >
                              Run scoring
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="w-fit rounded border border-red-300 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50"
                              onClick={() => void deleteMatch(m.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
