'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { parseGameMatchesBulk, parseGameMatchesCsv } from '@/lib/parse-game-matches-bulk'
import type { ParsedGameLine } from '@/lib/parse-game-matches-bulk'
import type { GameMatch, GameMatchStatus } from '@/lib/public-prediction-game'
import {
  FEATURED_MATCHES_MAX,
  validateFeaturedUpdateForFixture,
  validatePreviewFeaturedRowsForInsert,
  validatePreviewFeaturedShape,
  type LiveFeaturedRow,
} from '@/lib/game-matches-featured'
import { buildTeamAliasResolverMap, insertNewTeamAliasesOnly } from '@/lib/team-aliases-db'
import { matchPredictionsClosed, matchStartsSoon } from '@/lib/prediction-cutoff'
import { matchTeamName, type TeamMatchResult, type TeamRow } from '@/lib/team-name-match'

function isoToDatetimeLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Empty string → null. Invalid datetime → null and caller should reject. */
function datetimeLocalToIsoOrNull(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

type RowPreviewStatus = 'Matched' | 'Needs confirmation' | 'Unknown'

type FixturePreviewRow = {
  id: string
  lineNumber: number
  source: 'textarea' | 'csv'
  rawLine: string
  rawDate: string
  rawHome: string
  rawAway: string
  kickoff_time: string
  homeMatch: TeamMatchResult
  awayMatch: TeamMatchResult
  homeTeamId: number | null
  awayTeamId: number | null
  confirmedForInsert: boolean
  removed: boolean
  parseError?: string
  isFeatured: boolean
  featuredOrder: number | null
}

function sideStatus(m: TeamMatchResult, teamId: number | null): RowPreviewStatus {
  if (teamId != null) return 'Matched'
  if (m.matchedTeamName && !m.needsReview) return 'Matched'
  if (m.suggestedTeamName) return 'Needs confirmation'
  return 'Unknown'
}

function combinedRowStatus(home: RowPreviewStatus, away: RowPreviewStatus): RowPreviewStatus {
  if (home === 'Unknown' || away === 'Unknown') return 'Unknown'
  if (home === 'Needs confirmation' || away === 'Needs confirmation') return 'Needs confirmation'
  return 'Matched'
}

function initialTeamId(m: TeamMatchResult): number | null {
  return m.matchedTeamId ?? m.suggestedTeamId ?? null
}

function buildPreviewRows(
  parsed: ParsedGameLine[],
  teams: TeamRow[],
  aliasMap: Map<string, string>
): FixturePreviewRow[] {
  const out: FixturePreviewRow[] = []
  for (const p of parsed) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    if (!p.ok) {
      out.push({
        id,
        lineNumber: p.lineNumber,
        source: 'textarea',
        rawLine: p.raw,
        rawDate: '',
        rawHome: '',
        rawAway: '',
        kickoff_time: '',
        homeMatch: {
          matchedTeamId: null,
          matchedTeamName: null,
          matchMethod: 'unmatched',
          matchConfidence: null,
          suggestedTeamId: null,
          suggestedTeamName: null,
          needsReview: true,
        },
        awayMatch: {
          matchedTeamId: null,
          matchedTeamName: null,
          matchMethod: 'unmatched',
          matchConfidence: null,
          suggestedTeamId: null,
          suggestedTeamName: null,
          needsReview: true,
        },
        homeTeamId: null,
        awayTeamId: null,
        confirmedForInsert: false,
        removed: false,
        parseError: p.error,
        isFeatured: false,
        featuredOrder: null,
      })
      continue
    }

    const homeMatch = matchTeamName(p.home_team, teams, aliasMap)
    const awayMatch = matchTeamName(p.away_team, teams, aliasMap)
    const hid = initialTeamId(homeMatch)
    const aid = initialTeamId(awayMatch)
    const hs = sideStatus(homeMatch, hid)
    const as = sideStatus(awayMatch, aid)
    const rs = combinedRowStatus(hs, as)
    out.push({
      id,
      lineNumber: p.lineNumber,
      source: 'textarea',
      rawLine: p.raw,
      rawDate: p.raw_date ?? '',
      rawHome: p.home_team,
      rawAway: p.away_team,
      kickoff_time: p.kickoff_time,
      homeMatch,
      awayMatch,
      homeTeamId: hid,
      awayTeamId: aid,
      confirmedForInsert: rs === 'Matched',
      removed: false,
      isFeatured: false,
      featuredOrder: null,
    })
  }
  return out
}

function canInsertRow(r: FixturePreviewRow, teamById: Map<number, TeamRow>): boolean {
  if (r.removed || r.parseError) return false
  if (!r.confirmedForInsert) return false
  if (r.homeTeamId == null || r.awayTeamId == null) return false
  return teamById.has(r.homeTeamId) && teamById.has(r.awayTeamId)
}

export default function AdminGameMatchesPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [fixtures, setFixtures] = useState<GameMatch[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamAliasMap, setTeamAliasMap] = useState<Map<string, string>>(new Map())
  const [loadingList, setLoadingList] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<FixturePreviewRow[]>([])
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [fixtureFieldDraft, setFixtureFieldDraft] = useState<
    Record<
      string,
      {
        kickoff: string
        homeScore: string
        awayScore: string
        status: GameMatchStatus
      }
    >
  >({})
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [adminNowTick, setAdminNowTick] = useState(() => Date.now())
  const [lockExpiredBusy, setLockExpiredBusy] = useState(false)

  const teamById = useMemo(() => {
    const m = new Map<number, TeamRow>()
    for (const t of teams) m.set(t.id, t)
    return m
  }, [teams])

  const loadTeamsAndAliases = useCallback(async () => {
    const teamsRes = await supabase.from('teams').select('id, name').order('name', { ascending: true })
    const teamList = (teamsRes.data as TeamRow[]) ?? []
    if (teamsRes.error) {
      setMessage(`Could not load teams: ${teamsRes.error.message}`)
      setTeams([])
      setTeamAliasMap(new Map())
      return
    }
    setTeams(teamList)

    const aliasRes = await supabase.from('team_aliases').select('*')
    if (aliasRes.error) {
      setTeamAliasMap(new Map())
    } else {
      setTeamAliasMap(buildTeamAliasResolverMap((aliasRes.data as Record<string, unknown>[]) ?? [], teamList))
    }
  }, [])

  const loadFixtures = useCallback(async () => {
    setLoadingList(true)
    const { data, error } = await supabase
      .from('game_matches')
      .select(
        'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order'
      )
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

    checkAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!session?.user) {
          router.replace('/login')
          return
        }
        const { isAdmin } = await fetchUserIsAdmin(supabase, session.user.id)
        if (!isAdmin) router.replace('/predict-score')
      })()
    })

    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    if (!authChecked) return
    void loadFixtures()
    void loadTeamsAndAliases()
  }, [authChecked, loadFixtures, loadTeamsAndAliases])

  useEffect(() => {
    const id = window.setInterval(() => setAdminNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    setFixtureFieldDraft((prev) => {
      const next = { ...prev }
      for (const m of fixtures) {
        next[m.id] = {
          kickoff: isoToDatetimeLocalInput(m.kickoff_time),
          homeScore: m.home_score != null ? String(m.home_score) : '',
          awayScore: m.away_score != null ? String(m.away_score) : '',
          status: m.status,
        }
      }
      for (const id of Object.keys(next)) {
        if (!fixtures.some((f) => f.id === id)) delete next[id]
      }
      return next
    })
  }, [fixtures])

  const runPreviewFixed = async () => {
    setMessage('')
    setValidationErrors([])
    setPreviewRows([])

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
    setValidationErrors(errors)

    type Tagged = ParsedGameLine & { inputSource: 'textarea' | 'csv' }
    const merged: Tagged[] = [
      ...fromTextarea.map((p) => ({ ...p, inputSource: 'textarea' as const })),
      ...fromCsv.map((p) => ({ ...p, inputSource: 'csv' as const })),
    ]

    if (merged.length === 0) {
      setMessage('Nothing to preview — paste fixtures or choose a CSV file.')
      return
    }

    if (teams.length === 0) {
      setMessage('Teams list is empty — cannot match team names.')
      return
    }

    setPreviewLoading(true)
    try {
      const base = merged.map(({ inputSource: _s, ...rest }) => rest)
      const rows = buildPreviewRows(base, teams, teamAliasMap).map((r, i) => ({
        ...r,
        source: merged[i].inputSource,
      }))
      setPreviewRows(rows)
      setMessage(`Preview: ${rows.length} row(s). Review and confirm before insert.`)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function insertConfirmed() {
    setMessage('')
    const insertable = previewRows.filter((r) => canInsertRow(r, teamById))
    if (insertable.length === 0) {
      setMessage('No confirmed rows to insert. Confirm rows with both teams matched, or fix unknowns.')
      return
    }

    const shapeErr = validatePreviewFeaturedShape(insertable)
    if (shapeErr) {
      setMessage(shapeErr)
      return
    }

    const { data: liveRows, error: liveErr } = await supabase
      .from('game_matches')
      .select('id, is_featured, featured_order')
      .in('status', ['upcoming', 'locked'])

    if (liveErr) {
      setMessage(`Could not validate featured slots: ${liveErr.message}`)
      return
    }

    const featuredErr = validatePreviewFeaturedRowsForInsert(
      insertable,
      (liveRows ?? []) as LiveFeaturedRow[]
    )
    if (featuredErr) {
      setMessage(featuredErr)
      return
    }

    setSubmitting(true)
    const rows = insertable.map((r) => ({
      home_team: teamById.get(r.homeTeamId!)!.name,
      away_team: teamById.get(r.awayTeamId!)!.name,
      kickoff_time: r.kickoff_time,
      status: 'upcoming' as const,
      is_featured: r.isFeatured,
      featured_order: null,
    }))

    const { data: inserted, error } = await supabase.from('game_matches').insert(rows).select('id')

    if (error) {
      setMessage(`Insert failed: ${error.message}`)
      setSubmitting(false)
      return
    }

    const aliasPairs = new Map<string, { raw: string; canonicalName: string }>()
    for (const r of insertable) {
      const homeCanon = teamById.get(r.homeTeamId!)!.name
      const awayCanon = teamById.get(r.awayTeamId!)!.name
      if (r.rawHome.trim() && homeCanon) {
        aliasPairs.set(r.rawHome.trim().toLowerCase(), { raw: r.rawHome.trim(), canonicalName: homeCanon })
      }
      if (r.rawAway.trim() && awayCanon) {
        aliasPairs.set(r.rawAway.trim().toLowerCase(), { raw: r.rawAway.trim(), canonicalName: awayCanon })
      }
    }

    const aliasCandidates = [...aliasPairs.values()].filter(
      (a) => a.raw.toLowerCase() !== a.canonicalName.trim().toLowerCase()
    )

    const insertedCount = inserted?.length ?? rows.length
    let insertSummary = `Inserted ${insertedCount} game(s).`
    if (aliasCandidates.length > 0) {
      const aliasResult = await insertNewTeamAliasesOnly(supabase, teams, aliasCandidates)
      if (aliasResult.error) {
        insertSummary += ` Team aliases: ${aliasResult.error}`
      } else if (aliasResult.inserted > 0) {
        insertSummary += ` Saved ${aliasResult.inserted} new team alias(es) (existing mappings were left unchanged).`
        await loadTeamsAndAliases()
      }
    }

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

    setMessage(insertSummary + emailNote)
    setPreviewRows([])
    setBulkText('')
    setCsvFile(null)
    if (csvInputRef.current) csvInputRef.current.value = ''
    await loadFixtures()
    setSubmitting(false)
  }

  const activePreview = useMemo(() => previewRows.filter((r) => !r.removed), [previewRows])
  const insertablePreview = useMemo(
    () => activePreview.filter((r) => canInsertRow(r, teamById)),
    [activePreview, teamById]
  )
  const featuredShapeError = useMemo(
    () => validatePreviewFeaturedShape(insertablePreview),
    [insertablePreview]
  )
  const insertableCount = insertablePreview.length
  const needingAttentionCount = activePreview.filter((r) => !canInsertRow(r, teamById) && !r.parseError).length
  const parseErrorCount = activePreview.filter((r) => r.parseError).length
  const featuredSelectedCount = insertablePreview.filter((r) => r.isFeatured).length

  async function lockExpiredUpcoming() {
    setLockExpiredBusy(true)
    setMessage('')
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('game_matches')
      .update({ status: 'locked' })
      .eq('status', 'upcoming')
      .lte('kickoff_time', nowIso)
      .select('id')
    if (error) {
      setMessage(`Lock expired failed: ${error.message}`)
    } else {
      const n = data?.length ?? 0
      setMessage(n > 0 ? `Locked ${n} game(s) past kickoff.` : 'No upcoming games past kickoff to lock.')
    }
    await loadFixtures()
    setLockExpiredBusy(false)
  }

  async function saveFixtureFromDraft(matchId: string) {
    const d = fixtureFieldDraft[matchId]
    if (!d) {
      setMessage('Could not read row fields — try reloading.')
      return
    }
    setRowBusyId(matchId)
    const kickIso = datetimeLocalToIsoOrNull(d.kickoff)
    if (!kickIso) {
      setMessage('Kickoff must be a valid date and time.')
      setRowBusyId(null)
      return
    }

    const homeScoreTrim = d.homeScore.trim()
    const awayScoreTrim = d.awayScore.trim()
    let homeScore: number | null = null
    let awayScore: number | null = null
    if (homeScoreTrim !== '') {
      const n = Number(homeScoreTrim)
      if (!Number.isFinite(n)) {
        setMessage('Home score must be a number or empty.')
        setRowBusyId(null)
        return
      }
      homeScore = n
    }
    if (awayScoreTrim !== '') {
      const n = Number(awayScoreTrim)
      if (!Number.isFinite(n)) {
        setMessage('Away score must be a number or empty.')
        setRowBusyId(null)
        return
      }
      awayScore = n
    }

    if (d.status === 'completed') {
      if (homeScore == null || awayScore == null) {
        setMessage('Set both home and away scores before marking completed.')
        setRowBusyId(null)
        return
      }
    }

    const patch: Record<string, unknown> = {
      kickoff_time: kickIso,
      status: d.status,
    }
    if (d.status === 'completed') {
      patch.home_score = homeScore
      patch.away_score = awayScore
    } else {
      patch.home_score = null
      patch.away_score = null
    }

    const { error } = await supabase.from('game_matches').update(patch).eq('id', matchId)
    if (error) setMessage(`Update failed: ${error.message}`)
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

  function patchFixtureField(
    matchId: string,
    patch: Partial<{
      kickoff: string
      homeScore: string
      awayScore: string
      status: GameMatchStatus
    }>
  ) {
    setFixtureFieldDraft((prev) => {
      const cur = prev[matchId]
      if (!cur) return prev
      return { ...prev, [matchId]: { ...cur, ...patch } }
    })
  }

  function updatePreviewRow(id: string, patch: Partial<FixturePreviewRow>) {
    setPreviewRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function changePreviewKickoff(rowId: string, localVal: string) {
    const iso = datetimeLocalToIsoOrNull(localVal)
    if (!iso) return
    updatePreviewRow(rowId, { kickoff_time: iso })
  }

  function onTeamSelect(rowId: string, side: 'home' | 'away', teamIdStr: string) {
    const tid = teamIdStr === '' ? null : Number(teamIdStr)
    const nextId = tid != null && Number.isFinite(tid) ? tid : null
    setPreviewRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row
        const homeId = side === 'home' ? nextId : row.homeTeamId
        const awayId = side === 'away' ? nextId : row.awayTeamId
        const hs = sideStatus(row.homeMatch, homeId)
        const as = sideStatus(row.awayMatch, awayId)
        const rs = combinedRowStatus(hs, as)
        return {
          ...row,
          homeTeamId: homeId,
          awayTeamId: awayId,
          confirmedForInsert: rs === 'Matched' ? row.confirmedForInsert : false,
        }
      })
    )
  }

  function confirmRow(id: string) {
    const row = previewRows.find((r) => r.id === id)
    if (!row || row.parseError) return
    if (row.homeTeamId == null || row.awayTeamId == null) return
    updatePreviewRow(id, { confirmedForInsert: true })
  }

  function removePreviewRow(id: string) {
    updatePreviewRow(id, { removed: true })
  }

  function togglePreviewFeatured(id: string, checked: boolean) {
    setPreviewRows((rows) => {
      if (!checked) {
        return rows.map((r) => (r.id === id ? { ...r, isFeatured: false, featuredOrder: null } : r))
      }
      return rows.map((r) => (r.id === id ? { ...r, isFeatured: true, featuredOrder: null } : r))
    })
  }

  async function saveFixtureFeatured(m: GameMatch, is_featured: boolean) {
    setRowBusyId(m.id)
    const { data: live, error: liveErr } = await supabase
      .from('game_matches')
      .select('id, is_featured, featured_order')
      .in('status', ['upcoming', 'locked'])

    if (liveErr) {
      setMessage(liveErr.message)
      setRowBusyId(null)
      return
    }

    const v = validateFeaturedUpdateForFixture(
      m.id,
      is_featured,
      (live ?? []) as LiveFeaturedRow[]
    )
    if (v) {
      setMessage(v)
      setRowBusyId(null)
      return
    }

    const { error } = await supabase
      .from('game_matches')
      .update({
        is_featured,
        featured_order: is_featured ? m.featured_order ?? null : null,
      })
      .eq('id', m.id)

    if (error) setMessage(`Featured update failed: ${error.message}`)
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
              Admin only (user_profiles.role = admin).{' '}
              <Link href="/admin" className="text-blue-600 underline hover:text-blue-800">
                Back to admin
              </Link>
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold">Bulk add upcoming games</h2>
          <p className="mt-2 text-sm text-gray-600">
            Paste fixtures or upload CSV. Supported formats include{' '}
            <code className="text-xs">Date,Home Team,Away Team</code> (header row is skipped),{' '}
            <code className="text-xs">Home vs Away</code>, <code className="text-xs">Home, Away</code>, optional{' '}
            <code className="text-xs">| YYYY-MM-DD HH:mm</code> or a third CSV column for kickoff. Dates like{' '}
            <code className="text-xs">Mon.27Apr</code> sets kickoff to that day at <strong>15:00</strong> local;
            unparseable or empty dates use the <strong>coming Saturday at 15:00</strong>. Optional fourth column{' '}
            <code className="text-xs">Time</code> (e.g. <code className="text-xs">15:00</code>) sets kickoff clock on
            that fixture date (24h <code className="text-xs">HH:mm</code>). Predictions close at kickoff. Explicit
            full kickoff timestamps use{' '}
            <code className="text-xs">YYYY-MM-DD HH:mm</code> in local time. You can mark up to{' '}
            <strong>{FEATURED_MATCHES_MAX} featured</strong> upcoming/locked games per weekend for Predict a Score
            .
          </p>
          <textarea
            className="mt-4 w-full min-h-[160px] rounded-lg border border-gray-300 p-3 font-mono text-sm"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Date,Home Team,Away Team,Time\nMon.27Apr,Kingswood,St Stithians,15:00\nGrey College vs Paul Roos`}
            disabled={submitting || previewLoading}
          />
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-800">CSV upload (optional)</label>
            <p className="mt-1 text-xs text-gray-600">
              Headers: <code className="text-xs">Date,Home Team,Away Team</code> (optional{' '}
              <code className="text-xs">Time</code>) or{' '}
              <code className="text-xs">home_team,away_team</code> or{' '}
              <code className="text-xs">home_team,away_team,kickoff_time</code>.
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="mt-2 block w-full max-w-md text-sm"
              disabled={submitting || previewLoading}
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
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runPreviewFixed()}
              disabled={submitting || previewLoading}
              className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {previewLoading ? 'Previewing…' : 'Preview fixtures'}
            </button>
            <button
              type="button"
              onClick={() => void insertConfirmed()}
              disabled={
                submitting || previewRows.length === 0 || insertableCount === 0 || !!featuredShapeError
              }
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Inserting…' : 'Insert confirmed games & notify'}
            </button>
          </div>
          {featuredShapeError ? (
            <p className="mt-3 text-sm font-medium text-red-700">{featuredShapeError}</p>
          ) : null}
          {previewRows.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              Total (active): {activePreview.length} · Confirmed ready to insert: {insertableCount} · Needing attention:{' '}
              {needingAttentionCount}
              {parseErrorCount > 0 ? ` · Parse errors: ${parseErrorCount}` : ''} · Featured in import:{' '}
              {featuredSelectedCount}/{FEATURED_MATCHES_MAX}
            </p>
          )}
        </section>

        {previewRows.some((r) => !r.removed) && (
          <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/40 p-6">
            <h2 className="text-lg font-semibold">Import preview</h2>
            <p className="mt-1 text-sm text-gray-700">
              Only rows you <strong>confirm</strong> with both teams resolved are inserted. Use the team dropdown to fix
              unknowns, then Confirm row.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-700">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Raw Home</th>
                    <th className="py-2 pr-2">Matched Home</th>
                    <th className="py-2 pr-2">Raw Away</th>
                    <th className="py-2 pr-2">Matched Away</th>
                    <th className="py-2 pr-2">Kickoff</th>
                    <th className="py-2 pr-2">Featured</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    if (r.removed) return null
                    const hs = sideStatus(r.homeMatch, r.homeTeamId)
                    const as = sideStatus(r.awayMatch, r.awayTeamId)
                    const st = r.parseError ? 'Unknown' : combinedRowStatus(hs, as)
                    const dateCell = r.rawDate || (r.kickoff_time ? new Date(r.kickoff_time).toLocaleDateString() : '—')
                    const homeName = r.homeTeamId != null ? teamById.get(r.homeTeamId)?.name ?? '—' : '—'
                    const awayName = r.awayTeamId != null ? teamById.get(r.awayTeamId)?.name ?? '—' : '—'
                    return (
                      <tr key={r.id} className="border-b border-gray-200 align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">{r.parseError ? '—' : dateCell}</td>
                        <td className="py-2 pr-2">{r.parseError ? '—' : r.rawHome}</td>
                        <td className="py-2 pr-2">
                          {r.parseError ? (
                            '—'
                          ) : (
                            <div>
                              <div className="mb-1 font-medium text-gray-900">{homeName}</div>
                              <select
                              className="max-w-[200px] rounded border border-gray-300 px-1 py-1 text-xs"
                              value={r.homeTeamId ?? ''}
                              onChange={(e) => onTeamSelect(r.id, 'home', e.target.value)}
                            >
                              <option value="">— Select team —</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2">{r.parseError ? '—' : r.rawAway}</td>
                        <td className="py-2 pr-2">
                          {r.parseError ? (
                            '—'
                          ) : (
                            <div>
                              <div className="mb-1 font-medium text-gray-900">{awayName}</div>
                              <select
                              className="max-w-[200px] rounded border border-gray-300 px-1 py-1 text-xs"
                              value={r.awayTeamId ?? ''}
                              onChange={(e) => onTeamSelect(r.id, 'away', e.target.value)}
                            >
                              <option value="">— Select team —</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {r.parseError ? (
                            '—'
                          ) : (
                            <input
                              type="datetime-local"
                              className="max-w-[11rem] rounded border border-gray-300 px-1 py-1 text-xs"
                              value={isoToDatetimeLocalInput(r.kickoff_time)}
                              onChange={(e) => changePreviewKickoff(r.id, e.target.value)}
                            />
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {r.parseError ? (
                            '—'
                          ) : (
                            <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={r.isFeatured}
                                onChange={(e) => togglePreviewFeatured(r.id, e.target.checked)}
                              />
                              <span className="text-xs">Featured</span>
                            </label>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {r.parseError ? (
                            '—'
                          ) : (
                            <span>{st}</span>
                          )}
                          {!r.parseError && r.confirmedForInsert && canInsertRow(r, teamById) && (
                            <span className="ml-1 text-green-700">· ready</span>
                          )}
                        </td>
                        <td className="py-2">
                          {r.parseError ? (
                            <span className="text-gray-500">{r.parseError}</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="rounded border border-gray-400 px-2 py-0.5 text-xs hover:bg-white disabled:opacity-40"
                                disabled={r.homeTeamId == null || r.awayTeamId == null}
                                onClick={() => confirmRow(r.id)}
                              >
                                Confirm row
                              </button>
                              <button
                                type="button"
                                className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-800 hover:bg-red-50"
                                onClick={() => removePreviewRow(r.id)}
                              >
                                Remove from import
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Current fixtures</h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Edit kickoff (predictions close at kickoff), status, and scores, then <strong>Save row</strong>. Featured
                toggles save immediately. Use <strong>Run scoring</strong> after a match is completed.
              </p>
            </div>
            <button
              type="button"
              disabled={lockExpiredBusy || loadingList}
              onClick={() => void lockExpiredUpcoming()}
              className="shrink-0 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {lockExpiredBusy ? 'Locking…' : 'Lock expired games'}
            </button>
          </div>
          {loadingList ? (
            <p className="mt-4 text-sm text-gray-600">Loading…</p>
          ) : fixtures.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No rows in game_matches yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="py-2 pr-3">Home</th>
                    <th className="py-2 pr-3">Away</th>
                    <th className="py-2 pr-3">Kickoff</th>
                    <th className="py-2 pr-3">Pick window</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Scores</th>
                    <th className="py-2 pr-3">Featured</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((m) => {
                    const busy = rowBusyId === m.id
                    const fd = fixtureFieldDraft[m.id]
                    const adminAt = new Date(adminNowTick)
                    const windowBadge = matchPredictionsClosed(m, adminAt) ? (
                      <span className="inline-block rounded bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-800">
                        Closed
                      </span>
                    ) : matchStartsSoon(m, adminAt) ? (
                      <span className="inline-block rounded bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                        Starts soon
                      </span>
                    ) : (
                      <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                        Open
                      </span>
                    )
                    return (
                      <tr key={m.id} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-3">{m.home_team}</td>
                        <td className="py-2 pr-3">{m.away_team}</td>
                        <td className="py-2 pr-3">
                          {fd ? (
                            <input
                              type="datetime-local"
                              disabled={busy}
                              className="max-w-[11rem] rounded border border-gray-300 px-1 py-1 text-xs disabled:opacity-50"
                              value={fd.kickoff}
                              onChange={(e) => patchFixtureField(m.id, { kickoff: e.target.value })}
                            />
                          ) : (
                            <span className="text-xs text-gray-500">…</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 align-middle">{windowBadge}</td>
                        <td className="py-2 pr-3">
                          {fd ? (
                            <select
                              className="rounded border border-gray-300 px-1 py-1 text-xs capitalize"
                              disabled={busy}
                              value={fd.status}
                              onChange={(e) =>
                                patchFixtureField(m.id, { status: e.target.value as GameMatchStatus })
                              }
                            >
                              <option value="upcoming">upcoming</option>
                              <option value="locked">locked</option>
                              <option value="completed">completed</option>
                            </select>
                          ) : (
                            m.status
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {fd ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <input
                                type="number"
                                placeholder="H"
                                className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                disabled={busy}
                                value={fd.homeScore}
                                onChange={(e) => patchFixtureField(m.id, { homeScore: e.target.value })}
                              />
                              <span className="text-gray-400">–</span>
                              <input
                                type="number"
                                placeholder="A"
                                className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                disabled={busy}
                                value={fd.awayScore}
                                onChange={(e) => patchFixtureField(m.id, { awayScore: e.target.value })}
                              />
                            </div>
                          ) : (
                            `${m.home_score ?? '—'} – ${m.away_score ?? '—'}`
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!!m.is_featured}
                              disabled={busy || m.status === 'completed'}
                              onChange={(e) => {
                                const on = e.target.checked
                                if (!on) {
                                  void saveFixtureFeatured(m, false)
                                  return
                                }
                                void saveFixtureFeatured(m, true)
                              }}
                            />
                            <span className="text-xs">Featured</span>
                          </label>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              disabled={busy || !fd}
                              className="w-fit rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                              onClick={() => void saveFixtureFromDraft(m.id)}
                            >
                              Save row
                            </button>
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
