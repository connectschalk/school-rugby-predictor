'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildTeamAliasResolverMap } from '@/lib/team-aliases-db'
import { parseMasterSheetPaste } from '@/lib/fixture-master-paste'
import { normalizeTeamKey, type TeamRow } from '@/lib/team-name-match'

type VerificationStatus = 'draft' | 'needs_review' | 'verified' | 'rejected'
type MatchStatus = 'upcoming' | 'locked' | 'completed' | 'cancelled'

type SheetRow = {
  local_id: string
  id: string | null
  kickoff_time: string
  home_team: string
  away_team: string
  province_group: string
  league_group: string
  is_prestige: boolean
  status: MatchStatus
  verification_status: VerificationStatus
  prediction_cutoff_time: string
  is_featured: boolean
  featured_order: string
  admin_notes: string
}

type Filters = {
  fromDate: string
  toDate: string
  province_group: string
  league_group: string
  verification_status: string
  search: string
}

type SaveSummary = { inserted: number; updated: number; deleted: number }

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
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

function newLocalRow(): SheetRow {
  const now = new Date()
  now.setHours(11, 0, 0, 0)
  return {
    local_id: `new-${Date.now()}-${Math.random()}`,
    id: null,
    kickoff_time: toLocalInput(now.toISOString()),
    home_team: '',
    away_team: '',
    province_group: '',
    league_group: '',
    is_prestige: false,
    status: 'upcoming',
    verification_status: 'verified',
    prediction_cutoff_time: '',
    is_featured: false,
    featured_order: '',
    admin_notes: '',
  }
}

function rowDateKey(localKickoff: string): string {
  const iso = fromLocalInput(localKickoff)
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

function orderedPair(home: string, away: string): string {
  return `${normalizeTeamKey(home)}|${normalizeTeamKey(away)}`
}

function unorderedPair(home: string, away: string): string {
  const p = [normalizeTeamKey(home), normalizeTeamKey(away)].sort()
  return `${p[0]}|${p[1]}`
}

export default function FixtureMasterPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [rows, setRows] = useState<SheetRow[]>([])
  const [originalById, setOriginalById] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>({
    fromDate: '',
    toDate: '',
    province_group: '',
    league_group: '',
    verification_status: '',
    search: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null)
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [knownTeams, setKnownTeams] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const [matchesRes, teamsRes, aliasRes] = await Promise.all([
      supabase
        .from('game_matches')
        .select(
          'id, kickoff_time, home_team, away_team, province_group, league_group, is_prestige, status, verification_status, prediction_cutoff_time, is_featured, featured_order, admin_notes'
        )
        .eq('status', 'upcoming')
        .order('kickoff_time', { ascending: true }),
      supabase.from('teams').select('id, name'),
      supabase.from('team_aliases').select('*'),
    ])
    if (matchesRes.error) {
      setMessage(`Could not load fixtures: ${matchesRes.error.message}`)
      setRows([])
      setLoading(false)
      return
    }

    const mapped = (((matchesRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      local_id: String(r.id),
      id: String(r.id),
      kickoff_time: toLocalInput(String(r.kickoff_time ?? '')),
      home_team: String(r.home_team ?? ''),
      away_team: String(r.away_team ?? ''),
      province_group: String(r.province_group ?? ''),
      league_group: String(r.league_group ?? ''),
      is_prestige: !!r.is_prestige,
      status: (String(r.status ?? 'upcoming') as MatchStatus) ?? 'upcoming',
      verification_status: (String(r.verification_status ?? 'needs_review') as VerificationStatus) ?? 'needs_review',
      prediction_cutoff_time: toLocalInput((r.prediction_cutoff_time as string | null) ?? ''),
      is_featured: !!r.is_featured,
      featured_order: r.featured_order == null ? '' : String(r.featured_order),
      admin_notes: String(r.admin_notes ?? ''),
    })) as SheetRow[])
    setRows(mapped)
    setSelected(new Set())
    setDeletedIds(new Set())
    const orig = new Map<string, string>()
    for (const row of mapped) orig.set(row.local_id, JSON.stringify(row))
    setOriginalById(orig)

    const teamList = (teamsRes.data as TeamRow[] | null) ?? []
    const aliasMap = buildTeamAliasResolverMap((aliasRes.data as Record<string, unknown>[] | null) ?? [], teamList)
    const set = new Set<string>()
    for (const t of teamList) set.add(normalizeTeamKey(t.name))
    for (const [k, v] of aliasMap.entries()) {
      if (k) set.add(normalizeTeamKey(k))
      if (v) set.add(normalizeTeamKey(v))
    }
    setKnownTeams(set)
    setLoading(false)
  }, [])

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

  const warningsByLocalId = useMemo(() => {
    const byId = new Map<string, string[]>()
    const teamDayCount = new Map<string, number>()
    const exactCount = new Map<string, number>()
    const pairCount = new Map<string, number>()
    const pairOrderCount = new Map<string, Set<string>>()

    for (const r of rows) {
      const date = rowDateKey(r.kickoff_time)
      const home = normalizeTeamKey(r.home_team)
      const away = normalizeTeamKey(r.away_team)
      if (date && home) teamDayCount.set(`${date}|${home}`, (teamDayCount.get(`${date}|${home}`) ?? 0) + 1)
      if (date && away) teamDayCount.set(`${date}|${away}`, (teamDayCount.get(`${date}|${away}`) ?? 0) + 1)
      const ex = `${r.kickoff_time}|${orderedPair(r.home_team, r.away_team)}`
      exactCount.set(ex, (exactCount.get(ex) ?? 0) + 1)
      const up = `${r.kickoff_time}|${unorderedPair(r.home_team, r.away_team)}`
      pairCount.set(up, (pairCount.get(up) ?? 0) + 1)
      if (!pairOrderCount.has(up)) pairOrderCount.set(up, new Set())
      pairOrderCount.get(up)?.add(orderedPair(r.home_team, r.away_team))
    }

    for (const r of rows) {
      const warnings: string[] = []
      if (!r.home_team.trim()) warnings.push('Home team empty')
      if (!r.away_team.trim()) warnings.push('Away team empty')
      if (normalizeTeamKey(r.home_team) && normalizeTeamKey(r.home_team) === normalizeTeamKey(r.away_team)) {
        warnings.push('Home and away are the same team')
      }
      const date = rowDateKey(r.kickoff_time)
      const h = normalizeTeamKey(r.home_team)
      const a = normalizeTeamKey(r.away_team)
      if ((teamDayCount.get(`${date}|${h}`) ?? 0) > 1 || (teamDayCount.get(`${date}|${a}`) ?? 0) > 1) {
        warnings.push('Same team appears more than once on same date')
      }
      const ex = `${r.kickoff_time}|${orderedPair(r.home_team, r.away_team)}`
      if ((exactCount.get(ex) ?? 0) > 1) warnings.push('Exact duplicate')
      const up = `${r.kickoff_time}|${unorderedPair(r.home_team, r.away_team)}`
      if ((pairCount.get(up) ?? 0) > 1 && (pairOrderCount.get(up)?.size ?? 0) > 1) warnings.push('Reversed duplicate')
      if (r.home_team.trim() && !knownTeams.has(normalizeTeamKey(r.home_team))) warnings.push('Unknown home team')
      if (r.away_team.trim() && !knownTeams.has(normalizeTeamKey(r.away_team))) warnings.push('Unknown away team')
      byId.set(r.local_id, warnings)
    }
    return byId
  }, [rows, knownTeams])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const kickoffIso = fromLocalInput(r.kickoff_time)
      const dateOnly = kickoffIso ? kickoffIso.slice(0, 10) : ''
      if (filters.fromDate && dateOnly < filters.fromDate) return false
      if (filters.toDate && dateOnly > filters.toDate) return false
      if (filters.province_group && r.province_group !== filters.province_group) return false
      if (filters.league_group && r.league_group !== filters.league_group) return false
      if (filters.verification_status && r.verification_status !== filters.verification_status) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const hay = `${r.home_team} ${r.away_team}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, filters])

  const unsavedCount = useMemo(() => {
    let changed = 0
    for (const r of rows) {
      if (!r.id) {
        if (r.home_team || r.away_team || r.province_group || r.league_group) changed += 1
        continue
      }
      const orig = originalById.get(r.local_id)
      if (orig && orig !== JSON.stringify(r)) changed += 1
    }
    return changed + deletedIds.size
  }, [rows, originalById, deletedIds])

  const patchRow = (localId: string, patch: Partial<SheetRow>) => {
    setRows((prev) => prev.map((r) => (r.local_id === localId ? { ...r, ...patch } : r)))
  }

  const toggleSelected = (localId: string, on: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (on) n.add(localId)
      else n.delete(localId)
      return n
    })
  }

  const addRow = () => setRows((prev) => [...prev, newLocalRow()])

  const deleteSelectedRows = () => {
    const idsToDelete = new Set(selected)
    setRows((prev) => prev.filter((r) => !idsToDelete.has(r.local_id)))
    setDeletedIds((prev) => {
      const n = new Set(prev)
      for (const r of rows) {
        if (idsToDelete.has(r.local_id) && r.id) n.add(r.id)
      }
      return n
    })
    setSelected(new Set())
  }

  const markSelectedVerification = (status: VerificationStatus) => {
    setRows((prev) => prev.map((r) => (selected.has(r.local_id) ? { ...r, verification_status: status } : r)))
  }

  const applyPaste = (text: string) => {
    const parsed = parseMasterSheetPaste(text)
    if (!parsed.rows.length) {
      setMessage(parsed.errors[0] ?? 'No rows parsed from paste.')
      return
    }
    const add: SheetRow[] = parsed.rows.map((p) => ({
      ...newLocalRow(),
      local_id: `paste-${Date.now()}-${Math.random()}`,
      kickoff_time: toLocalInput(p.kickoff_time),
      home_team: p.home_team,
      away_team: p.away_team,
      province_group: p.province_group,
      league_group: p.league_group,
      is_prestige: p.is_prestige,
      status: 'upcoming',
      verification_status: 'verified',
      is_featured: false,
    }))
    setRows((prev) => [...prev, ...add])
    setMessage(`Pasted ${add.length} row(s).${parsed.errors.length ? ` ${parsed.errors.length} row(s) skipped.` : ''}`)
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      applyPaste(text)
    } catch {
      setShowPasteBox(true)
      setMessage('Clipboard read blocked. Paste into the box and apply.')
    }
  }

  const saveChanges = async () => {
    setSaving(true)
    setMessage('')
    setSaveSummary(null)

    const criticalErrors: string[] = []
    for (const r of rows) {
      if (!r.home_team.trim()) criticalErrors.push(`${r.local_id}: missing home_team`)
      if (!r.away_team.trim()) criticalErrors.push(`${r.local_id}: missing away_team`)
      if (!fromLocalInput(r.kickoff_time)) criticalErrors.push(`${r.local_id}: missing kickoff_time`)
      if (normalizeTeamKey(r.home_team) && normalizeTeamKey(r.home_team) === normalizeTeamKey(r.away_team)) {
        criticalErrors.push(`${r.local_id}: same home and away`)
      }
    }
    if (criticalErrors.length) {
      setMessage(`Save blocked (${criticalErrors.length} critical issue(s)). Fix empty teams/kickoff/same-team rows first.`)
      setSaving(false)
      return
    }

    let inserted = 0
    let updated = 0
    let deleted = 0

    if (deletedIds.size > 0) {
      const ids = [...deletedIds]
      const { error } = await supabase.from('game_matches').delete().in('id', ids)
      if (error) {
        setMessage(`Delete failed: ${error.message}`)
        setSaving(false)
        return
      }
      deleted = ids.length
    }

    const existingRows = rows.filter((r) => !!r.id)
    const newRows = rows.filter((r) => !r.id)
    const changedExisting = existingRows.filter((r) => {
      const orig = originalById.get(r.local_id)
      return !orig || orig !== JSON.stringify(r)
    })

    for (const r of changedExisting) {
      const kickoffIso = fromLocalInput(r.kickoff_time)
      const cutoffIso = fromLocalInput(r.prediction_cutoff_time)
      const { error } = await supabase
        .from('game_matches')
        .update({
          kickoff_time: kickoffIso,
          home_team: r.home_team.trim(),
          away_team: r.away_team.trim(),
          province_group: r.province_group.trim() || null,
          league_group: r.league_group.trim() || null,
          is_prestige: r.is_prestige,
          status: r.status,
          verification_status: r.verification_status || 'verified',
          prediction_cutoff_time: cutoffIso,
          is_featured: r.is_featured,
          featured_order: r.featured_order.trim() ? Number(r.featured_order) : null,
          admin_notes: r.admin_notes.trim() || null,
          verified_at: (r.verification_status || 'verified') === 'verified' ? new Date().toISOString() : null,
        })
        .eq('id', r.id!)
      if (error) {
        setMessage(`Update failed: ${error.message}`)
        setSaving(false)
        return
      }
      updated += 1
    }

    if (newRows.length > 0) {
      const payload = newRows.map((r) => ({
        kickoff_time: fromLocalInput(r.kickoff_time),
        home_team: r.home_team.trim(),
        away_team: r.away_team.trim(),
        province_group: r.province_group.trim() || null,
        league_group: r.league_group.trim() || null,
        is_prestige: r.is_prestige,
        status: r.status || 'upcoming',
        verification_status: r.verification_status || 'verified',
        prediction_cutoff_time: fromLocalInput(r.prediction_cutoff_time),
        is_featured: r.is_featured,
        featured_order: r.featured_order.trim() ? Number(r.featured_order) : null,
        admin_notes: r.admin_notes.trim() || null,
        verified_at: (r.verification_status || 'verified') === 'verified' ? new Date().toISOString() : null,
      }))
      const { data, error } = await supabase.from('game_matches').insert(payload).select('id')
      if (error) {
        setMessage(`Insert failed: ${error.message}`)
        setSaving(false)
        return
      }
      inserted = data?.length ?? payload.length
    }

    setSaveSummary({ inserted, updated, deleted })
    setMessage('Master sheet saved.')
    setSaving(false)
    await loadData()
  }

  const uniqueProvince = [...new Set(rows.map((r) => r.province_group).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
  const uniqueLeague = [...new Set(rows.map((r) => r.league_group).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )

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
      <div className="mx-auto max-w-[96rem] px-6 py-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Fixture Master Sheet</h1>
            <p className="mt-1 text-sm text-gray-600">
              Fast source-of-truth editor for upcoming fixtures in `game_matches`.
            </p>
          </div>
          <Link href="/admin" className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50">
            Back to admin
          </Link>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3 lg:grid-cols-6">
          <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} />
          <input type="date" className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} />
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.province_group} onChange={(e) => setFilters((f) => ({ ...f, province_group: e.target.value }))}>
            <option value="">All provinces</option>
            {uniqueProvince.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.league_group} onChange={(e) => setFilters((f) => ({ ...f, league_group: e.target.value }))}>
            <option value="">All leagues</option>
            {uniqueLeague.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.verification_status} onChange={(e) => setFilters((f) => ({ ...f, verification_status: e.target.value }))}>
            <option value="">All verification</option>
            <option value="verified">verified</option>
            <option value="needs_review">needs_review</option>
            <option value="draft">draft</option>
            <option value="rejected">rejected</option>
          </select>
          <input type="search" placeholder="Search team" className="rounded border border-gray-300 px-2 py-1 text-sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={addRow} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">Add row</button>
          <button type="button" onClick={() => void pasteFromClipboard()} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">Paste from clipboard</button>
          <button type="button" onClick={() => setShowPasteBox((x) => !x)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">Paste box</button>
          <button type="button" onClick={() => void saveChanges()} disabled={saving || loading} className="rounded bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save changes'}</button>
          <button type="button" onClick={deleteSelectedRows} className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100">Delete selected</button>
          <button type="button" onClick={() => markSelectedVerification('verified')} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">Mark selected verified</button>
          <button type="button" onClick={() => markSelectedVerification('needs_review')} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">Mark selected needs review</button>
          <span className="ml-auto text-xs text-gray-700">Unsaved changes: {unsavedCount}</span>
        </div>

        {showPasteBox ? (
          <div className="mb-3 rounded border border-gray-200 p-3">
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste rows from Excel/Sheets here..." className="min-h-[110px] w-full rounded border border-gray-300 p-2 font-mono text-xs" />
            <div className="mt-2">
              <button type="button" onClick={() => applyPaste(pasteText)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">Apply pasted rows</button>
            </div>
          </div>
        ) : null}

        {message ? <p className="mb-2 text-sm text-gray-800">{message}</p> : null}
        {saveSummary ? <p className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">Saved: inserted {saveSummary.inserted}, updated {saveSummary.updated}, deleted {saveSummary.deleted}.</p> : null}

        {loading ? (
          <p className="text-sm text-gray-600">Loading fixtures...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[1800px] border-collapse text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2">Sel</th>
                  <th className="px-2 py-2">Kickoff</th>
                  <th className="px-2 py-2">Home</th>
                  <th className="px-2 py-2">Away</th>
                  <th className="px-2 py-2">Province</th>
                  <th className="px-2 py-2">League</th>
                  <th className="px-2 py-2">Prestige</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Verification</th>
                  <th className="px-2 py-2">Cutoff</th>
                  <th className="px-2 py-2">Featured</th>
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Notes</th>
                  <th className="px-2 py-2">Warnings</th>
                  <th className="px-2 py-2">Row</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const warnings = warningsByLocalId.get(r.local_id) ?? []
                  return (
                    <tr key={r.local_id} className="border-t border-gray-200 align-top">
                      <td className="px-2 py-1">
                        <input type="checkbox" checked={selected.has(r.local_id)} onChange={(e) => toggleSelected(r.local_id, e.target.checked)} />
                      </td>
                      <td className="px-2 py-1"><input type="datetime-local" className="w-44 rounded border border-gray-300 px-1 py-1" value={r.kickoff_time} onChange={(e) => patchRow(r.local_id, { kickoff_time: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="w-40 rounded border border-gray-300 px-1 py-1" value={r.home_team} onChange={(e) => patchRow(r.local_id, { home_team: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="w-40 rounded border border-gray-300 px-1 py-1" value={r.away_team} onChange={(e) => patchRow(r.local_id, { away_team: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="w-36 rounded border border-gray-300 px-1 py-1" value={r.province_group} onChange={(e) => patchRow(r.local_id, { province_group: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="w-36 rounded border border-gray-300 px-1 py-1" value={r.league_group} onChange={(e) => patchRow(r.local_id, { league_group: e.target.value })} /></td>
                      <td className="px-2 py-1"><input type="checkbox" checked={r.is_prestige} onChange={(e) => patchRow(r.local_id, { is_prestige: e.target.checked })} /></td>
                      <td className="px-2 py-1">
                        <select className="rounded border border-gray-300 px-1 py-1" value={r.status} onChange={(e) => patchRow(r.local_id, { status: e.target.value as MatchStatus })}>
                          <option value="upcoming">upcoming</option><option value="locked">locked</option><option value="completed">completed</option><option value="cancelled">cancelled</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select className="rounded border border-gray-300 px-1 py-1" value={r.verification_status} onChange={(e) => patchRow(r.local_id, { verification_status: e.target.value as VerificationStatus })}>
                          <option value="verified">verified</option><option value="needs_review">needs_review</option><option value="draft">draft</option><option value="rejected">rejected</option>
                        </select>
                      </td>
                      <td className="px-2 py-1"><input type="datetime-local" className="w-44 rounded border border-gray-300 px-1 py-1" value={r.prediction_cutoff_time} onChange={(e) => patchRow(r.local_id, { prediction_cutoff_time: e.target.value })} /></td>
                      <td className="px-2 py-1"><input type="checkbox" checked={r.is_featured} onChange={(e) => patchRow(r.local_id, { is_featured: e.target.checked })} /></td>
                      <td className="px-2 py-1"><input className="w-14 rounded border border-gray-300 px-1 py-1" value={r.featured_order} onChange={(e) => patchRow(r.local_id, { featured_order: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="w-56 rounded border border-gray-300 px-1 py-1" value={r.admin_notes} onChange={(e) => patchRow(r.local_id, { admin_notes: e.target.value })} /></td>
                      <td className="px-2 py-1">
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {warnings.length === 0 ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">ok</span> : warnings.map((w) => (
                            <span key={`${r.local_id}-${w}`} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">{w}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold hover:bg-gray-50" onClick={() => patchRow(r.local_id, { home_team: r.away_team, away_team: r.home_team })}>Swap H/A</button>
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
