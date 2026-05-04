'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildTeamAliasResolverMap } from '@/lib/team-aliases-db'
import { normalizeTeamKey, type TeamRow } from '@/lib/team-name-match'
import { detectFixtureWarnings, type FixtureVerificationStatus } from '@/lib/fixture-review'

type ReviewRow = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  province_group: string | null
  league_group: string | null
  home_team_province: string | null
  away_team_province: string | null
  is_prestige: boolean | null
  source_name: string | null
  source_url: string | null
  created_at: string
  verification_status: FixtureVerificationStatus
  rejected_reason: string | null
  admin_notes: string | null
  imported_batch_id: string | null
}

type FixtureImportBatch = {
  id: string
  created_at: string
  source_name: string | null
  source_url: string | null
  import_status: string
  total_rows: number
  verified_rows: number
  rejected_rows: number
}

type EditDraft = {
  home_team: string
  away_team: string
  kickoff_time: string
  province_group: string
  league_group: string
  is_prestige: boolean
  admin_notes: string
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromLocalInput(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function FixtureReviewPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [batches, setBatches] = useState<FixtureImportBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>('all')
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [warningUniverse, setWarningUniverse] = useState<ReviewRow[]>([])
  const [aliasMap, setAliasMap] = useState<Map<string, string>>(new Map())
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const [fixtureRes, warningRes, teamsRes, aliasRes, batchRes] = await Promise.all([
      supabase
        .from('game_matches')
        .select(
          'id, home_team, away_team, kickoff_time, status, province_group, league_group, home_team_province, away_team_province, is_prestige, source_name, source_url, created_at, verification_status, rejected_reason, admin_notes, imported_batch_id'
        )
        .in('verification_status', ['draft', 'needs_review'])
        .order('kickoff_time', { ascending: true }),
      supabase
        .from('game_matches')
        .select('id, home_team, away_team, kickoff_time, status, province_group, league_group, home_team_province, away_team_province, is_prestige, source_name, source_url, created_at, verification_status, rejected_reason, admin_notes, imported_batch_id')
        .order('kickoff_time', { ascending: true }),
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('team_aliases').select('*'),
      supabase
        .from('fixture_import_batches')
        .select('id, created_at, source_name, source_url, import_status, total_rows, verified_rows, rejected_rows')
        .order('created_at', { ascending: false }),
    ])

    if (fixtureRes.error) {
      setRows([])
      setMessage(`Could not load fixtures: ${fixtureRes.error.message}`)
      setLoading(false)
      return
    }

    const loadedRows = ((fixtureRes.data as ReviewRow[] | null) ?? []).map((r) => ({
      ...r,
      verification_status: (r.verification_status ?? 'needs_review') as FixtureVerificationStatus,
    }))
    setRows(selectedBatchId === 'all' ? loadedRows : loadedRows.filter((r) => r.imported_batch_id === selectedBatchId))
    setWarningUniverse(
      ((warningRes.data as ReviewRow[] | null) ?? []).map((r) => ({
        ...r,
        verification_status: (r.verification_status ?? 'needs_review') as FixtureVerificationStatus,
      }))
    )
    setBatches((batchRes.data as FixtureImportBatch[] | null) ?? [])

    const nextDrafts: Record<string, EditDraft> = {}
    for (const r of loadedRows) {
      nextDrafts[r.id] = {
        home_team: r.home_team,
        away_team: r.away_team,
        kickoff_time: toLocalInput(r.kickoff_time),
        province_group: r.province_group ?? '',
        league_group: r.league_group ?? '',
        is_prestige: !!r.is_prestige,
        admin_notes: r.admin_notes ?? '',
      }
    }
    setDrafts(nextDrafts)

    const loadedTeams = (teamsRes.data as TeamRow[] | null) ?? []
    setTeams(loadedTeams)
    if (!aliasRes.error) {
      setAliasMap(buildTeamAliasResolverMap((aliasRes.data as Record<string, unknown>[]) ?? [], loadedTeams))
    } else {
      setAliasMap(new Map())
    }
    setLoading(false)
  }, [selectedBatchId])

  useEffect(() => {
    async function checkAccess() {
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
    }
    void checkAccess()
  }, [router])

  useEffect(() => {
    if (!authChecked) return
    void loadData()
  }, [authChecked, loadData])

  const knownTeamNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of teams) set.add(normalizeTeamKey(t.name))
    for (const [k, v] of aliasMap.entries()) {
      if (k) set.add(normalizeTeamKey(k))
      if (v) set.add(normalizeTeamKey(v))
    }
    return set
  }, [teams, aliasMap])

  const warningsById = useMemo(
    () =>
      detectFixtureWarnings(warningUniverse, (name) => {
        const n = normalizeTeamKey(name)
        if (!n) return false
        if (knownTeamNames.has(n)) return true
        const aliasHit = aliasMap.get(n)
        return !!aliasHit
      }),
    [warningUniverse, knownTeamNames, aliasMap]
  )

  const setDraftField = (id: string, patch: Partial<EditDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const verifyFixture = async (rowId: string) => {
    setBusyId(rowId)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const who = session?.user?.email ?? session?.user?.id ?? 'admin'
    const { error } = await supabase
      .from('game_matches')
      .update({
        verification_status: 'verified',
        verified_by: who,
        verified_at: new Date().toISOString(),
        rejected_reason: null,
      })
      .eq('id', rowId)
    if (error) {
      setMessage(`Verify failed: ${error.message}`)
      setBusyId(null)
      return
    }
    setBusyId(null)
    await loadData()
  }

  const rejectFixture = async (rowId: string) => {
    const reason = window.prompt('Reason for rejection (optional):', '')
    setBusyId(rowId)
    const { error } = await supabase
      .from('game_matches')
      .update({
        verification_status: 'rejected',
        rejected_reason: reason?.trim() || null,
        verified_at: null,
      })
      .eq('id', rowId)
    if (error) {
      setMessage(`Reject failed: ${error.message}`)
      setBusyId(null)
      return
    }
    setBusyId(null)
    await loadData()
  }

  const deleteFixture = async (rowId: string) => {
    if (!window.confirm('Delete this fixture and related predictions/comments?')) return
    setBusyId(rowId)
    const { error } = await supabase.from('game_matches').delete().eq('id', rowId)
    if (error) setMessage(`Delete failed: ${error.message}`)
    setBusyId(null)
    await loadData()
  }

  const saveEdits = async (rowId: string) => {
    const d = drafts[rowId]
    if (!d) return
    const kickoffIso = fromLocalInput(d.kickoff_time)
    if (!kickoffIso) {
      setMessage('Kickoff must be valid date/time.')
      return
    }
    setBusyId(rowId)
    const { error } = await supabase
      .from('game_matches')
      .update({
        home_team: d.home_team.trim(),
        away_team: d.away_team.trim(),
        kickoff_time: kickoffIso,
        province_group: d.province_group.trim() || null,
        league_group: d.league_group.trim() || null,
        is_prestige: d.is_prestige,
        admin_notes: d.admin_notes.trim() || null,
        verification_status: 'needs_review',
      })
      .eq('id', rowId)
    if (error) {
      setMessage(`Save failed: ${error.message}`)
      setBusyId(null)
      return
    }
    setBusyId(null)
    await loadData()
  }

  const markExistingUpcomingForReview = async () => {
    setMessage('')
    setLoading(true)
    const { error } = await supabase
      .from('game_matches')
      .update({ verification_status: 'needs_review' })
      .eq('status', 'upcoming')
      .or('verification_status.is.null,verification_status.eq.draft')
    if (error) setMessage(`Bulk mark failed: ${error.message}`)
    await loadData()
    setLoading(false)
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
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Fixture Review</h1>
            <p className="mt-1 text-sm text-gray-600">
              Unverified fixtures only (`draft` / `needs_review`). Public pages only use verified upcoming fixtures.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void markExistingUpcomingForReview()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50"
              disabled={loading}
            >
              Mark existing upcoming as needs_review
            </button>
            <Link
              href="/admin"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50"
            >
              Back to admin
            </Link>
          </div>
        </div>

        <section className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Batch History</h2>
            <label className="text-xs text-gray-700">
              Batch filter:{' '}
              <select
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                <option value="all">Show all unverified</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {(b.source_name || 'Unknown source') + ' · ' + new Date(b.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">URL</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Total</th>
                  <th className="px-2 py-2">Verified</th>
                  <th className="px-2 py-2">Rejected</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={`border-t border-gray-100 ${selectedBatchId === b.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 font-medium text-gray-900">{b.source_name || 'Unknown source'}</td>
                    <td className="px-2 py-2 text-gray-600">{b.source_url || '—'}</td>
                    <td className="px-2 py-2 text-gray-600">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="px-2 py-2 text-gray-600">{b.total_rows}</td>
                    <td className="px-2 py-2 text-gray-600">{b.verified_rows}</td>
                    <td className="px-2 py-2 text-gray-600">{b.rejected_rows}</td>
                    <td className="px-2 py-2 text-gray-600">{b.import_status}</td>
                  </tr>
                ))}
                {batches.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-gray-500" colSpan={7}>
                      No fixture import batches yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {message ? <p className="mb-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-gray-600">Loading fixtures...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">No unverified fixtures found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[1300px] border-collapse text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2">Kickoff</th>
                  <th className="px-3 py-2">Home</th>
                  <th className="px-3 py-2">Away</th>
                  <th className="px-3 py-2">Province</th>
                  <th className="px-3 py-2">League</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Warnings</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = drafts[r.id]
                  const warnings = warningsById.get(r.id) ?? []
                  const busy = busyId === r.id
                  return (
                    <tr key={r.id} className="border-t border-gray-200 align-top">
                      <td className="px-3 py-2">
                        <input
                          type="datetime-local"
                          className="w-44 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={d?.kickoff_time ?? ''}
                          onChange={(e) => setDraftField(r.id, { kickoff_time: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-44 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={d?.home_team ?? ''}
                          onChange={(e) => setDraftField(r.id, { home_team: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-44 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={d?.away_team ?? ''}
                          onChange={(e) => setDraftField(r.id, { away_team: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={d?.province_group ?? ''}
                          onChange={(e) => setDraftField(r.id, { province_group: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
                          value={d?.league_group ?? ''}
                          onChange={(e) => setDraftField(r.id, { league_group: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <p className="font-medium text-gray-900">{r.source_name || 'Unknown source'}</p>
                        <p className="text-gray-600">{r.source_url || '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-[280px] flex-wrap gap-1">
                          {warnings.length === 0 ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">No warnings</span>
                          ) : (
                            warnings.map((w, idx) => (
                              <span key={`${r.id}-${idx}`} className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                                {w.message}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveEdits(r.id)}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                          >
                            Edit fixture
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void verifyFixture(r.id)}
                            className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            Verify fixture
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void rejectFixture(r.id)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Reject fixture
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteFixture(r.id)}
                            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                          >
                            Delete fixture
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
      </div>
    </main>
  )
}
