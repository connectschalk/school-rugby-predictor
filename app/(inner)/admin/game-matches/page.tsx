'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { parseGameMatchesBulk, parseGameMatchesCsv, splitCsvLine } from '@/lib/parse-game-matches-bulk'
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
type ImportMode = 'legacy' | 'group_csv'

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
  provinceGroup: string
  leagueGroup: string
  provinceGroupRaw: string
  provinceGroupResolved: string
  provinceGroupIsNew: boolean
  leagueGroupRaw: string
  leagueGroupResolved: string
  leagueGroupIsNew: boolean
  prestige: boolean
  status: GameMatchStatus
  previewAction?: 'create' | 'update' | 'error'
  previewError?: string | null
}

type GroupCsvParsedRow = {
  lineNumber: number
  raw: string
  raw_date: string
  home_team: string
  away_team: string
  kickoff_time: string
  provinceGroup: string | null
  leagueGroup: string | null
  prestige: boolean
  status: GameMatchStatus
}

function normalizeHeaderCell(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseBoolCell(s: string): boolean {
  const v = s.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function parseStatusCell(s: string): GameMatchStatus {
  const v = s.trim().toLowerCase()
  if (!v) return 'upcoming'
  if (v === 'scheduled') return 'upcoming'
  if (v === 'upcoming') return 'upcoming'
  if (v === 'locked') return 'locked'
  if (v === 'completed') return 'completed'
  if (v === 'cancelled') return 'cancelled'
  return 'upcoming'
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function toSastIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(Date.UTC(y, m - 1, d, hh - 2, mm, 0, 0)).toISOString()
}

function parseDateFlexible(dateRaw: string, now: Date): { y: number; m: number; d: number } | null {
  const d = dateRaw.trim()
  if (!d) return null
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) }

  const long = d.match(/^(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})$/)
  if (long) {
    const m = MONTH_MAP[long[2].slice(0, 3).toLowerCase()]
    if (!m) return null
    return { y: Number(long[3]), m, d: Number(long[1]) }
  }

  const short = d.match(/^(?:[a-zA-Z]{2,5}\.?)?(\d{1,2})([a-zA-Z]{3})$/)
  if (short) {
    const m = MONTH_MAP[short[2].toLowerCase()]
    if (!m) return null
    return { y: now.getFullYear(), m, d: Number(short[1]) }
  }
  return null
}

function parseKickoffFromDateAndTime(dateRaw: string, timeRaw: string, now: Date): string | null {
  const parsedDate = parseDateFlexible(dateRaw, now)
  if (!parsedDate) return null
  const t = timeRaw.trim()
  let hh = 13
  let mm = 0
  if (t) {
    const hm = t.match(/^(\d{1,2}):(\d{2})$/)
    if (hm) {
      hh = Number(hm[1]); mm = Number(hm[2])
    } else {
      const full = new Date(t)
      if (!Number.isNaN(full.getTime())) return full.toISOString()
      return null
    }
  }
  return toSastIso(parsedDate.y, parsedDate.m, parsedDate.d, hh, mm)
}

function parseGroupCsv(csvText: string): {
  rows: GroupCsvParsedRow[]
  errors: string[]
  hasProvinceGroupColumn: boolean
  hasLeagueGroupColumn: boolean
  hasPrestigeColumn: boolean
  isNewFormatDetected: boolean
} {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) {
    return {
      rows: [],
      errors: [],
      hasProvinceGroupColumn: false,
      hasLeagueGroupColumn: false,
      hasPrestigeColumn: false,
      isNewFormatDetected: false,
    }
  }

  const header = splitCsvLine(lines[0]).map(normalizeHeaderCell)
  const idx = {
    date: header.indexOf('date'),
    home: header.indexOf('home team'),
    away: header.indexOf('away team'),
    kick: header.indexOf('kickoff time'),
    province: header.indexOf('province group'),
    league: header.indexOf('league group'),
    prestige: header.indexOf('prestige'),
    status: header.indexOf('status'),
  }

  const requiredOk = idx.date >= 0 && idx.home >= 0 && idx.away >= 0
  const isNewFormatDetected = idx.province >= 0 || idx.league >= 0 || idx.prestige >= 0
  if (!requiredOk) {
    return {
      rows: [],
      errors: [
        'CSV header must include at least: Date, Home Team, Away Team (other columns optional).',
      ],
      hasProvinceGroupColumn: idx.province >= 0,
      hasLeagueGroupColumn: idx.league >= 0,
      hasPrestigeColumn: idx.prestige >= 0,
      isNewFormatDetected,
    }
  }

  const rows: GroupCsvParsedRow[] = []
  const errors: string[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const raw = lines[i]
    const lineNumber = i + 1
    const cells = splitCsvLine(raw)
    const dateRaw = (cells[idx.date] ?? '').trim()
    const home = (cells[idx.home] ?? '').trim()
    const away = (cells[idx.away] ?? '').trim()
    const kickRaw = idx.kick >= 0 ? (cells[idx.kick] ?? '').trim() : ''
    const province = idx.province >= 0 ? (cells[idx.province] ?? '').trim() : ''
    const league = idx.league >= 0 ? (cells[idx.league] ?? '').trim() : ''
    const prestigeRaw = idx.prestige >= 0 ? (cells[idx.prestige] ?? '').trim() : ''
    const statusRaw = idx.status >= 0 ? (cells[idx.status] ?? '').trim() : ''

    if (!home || !away) {
      errors.push(`CSV line ${lineNumber}: Home Team and Away Team are required`)
      continue
    }

    const kickoff = parseKickoffFromDateAndTime(dateRaw, kickRaw, new Date())
    if (!kickoff) {
      errors.push(`CSV line ${lineNumber}: Could not parse Date/Kickoff Time`)
      continue
    }

    rows.push({
      lineNumber,
      raw,
      raw_date: dateRaw,
      home_team: home,
      away_team: away,
      kickoff_time: kickoff,
      provinceGroup: province || null,
      leagueGroup: league || null,
      prestige: parseBoolCell(prestigeRaw),
      status: parseStatusCell(statusRaw),
    })
  }

  return {
    rows,
    errors,
    hasProvinceGroupColumn: idx.province >= 0,
    hasLeagueGroupColumn: idx.league >= 0,
    hasPrestigeColumn: idx.prestige >= 0,
    isNewFormatDetected,
  }
}

function shouldTryGroupCsvParse(text: string): boolean {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim())
  if (!firstLine) return false
  const header = splitCsvLine(firstLine).map(normalizeHeaderCell)
  const hasCoreCsvHeader = header.includes('date') && header.includes('home team') && header.includes('away team')
  const hasGroupHint =
    header.includes('province group') ||
    header.includes('league group') ||
    header.includes('prestige') ||
    header.includes('province/group') ||
    header.includes('league/group')
  return hasCoreCsvHeader || hasGroupHint
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
        provinceGroup: '',
        leagueGroup: '',
        provinceGroupRaw: '',
        provinceGroupResolved: '',
        provinceGroupIsNew: false,
        leagueGroupRaw: '',
        leagueGroupResolved: '',
        leagueGroupIsNew: false,
        prestige: false,
        status: 'upcoming',
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
      provinceGroup: '',
      leagueGroup: '',
      provinceGroupRaw: '',
      provinceGroupResolved: '',
      provinceGroupIsNew: false,
      leagueGroupRaw: '',
      leagueGroupResolved: '',
      leagueGroupIsNew: false,
      prestige: false,
      status: 'upcoming',
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
        provinceGroup: string
        leagueGroup: string
        isPrestige: boolean
      }
    >
  >({})
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [adminNowTick, setAdminNowTick] = useState(() => Date.now())
  const [lockExpiredBusy, setLockExpiredBusy] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('legacy')
  const [showGroupPreviewColumns, setShowGroupPreviewColumns] = useState({
    province: false,
    league: false,
    prestige: false,
  })

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
        'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order, province_group, league_group, is_prestige'
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
          provinceGroup: m.province_group ?? '',
          leagueGroup: m.league_group ?? '',
          isPrestige: !!m.is_prestige,
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
    const groupParseInput = csvText || bulkText
    const fromGroupCsv = shouldTryGroupCsvParse(groupParseInput)
      ? parseGroupCsv(groupParseInput)
      : {
          rows: [] as GroupCsvParsedRow[],
          errors: [] as string[],
          hasProvinceGroupColumn: false,
          hasLeagueGroupColumn: false,
          hasPrestigeColumn: false,
          isNewFormatDetected: false,
        }
    const errors = [
      ...fromTextarea.filter((p) => !p.ok).map((p) => `Textarea line ${p.lineNumber}: ${p.error}`),
      ...fromCsv.filter((p) => !p.ok).map((p) => `CSV line ${p.lineNumber}: ${p.error}`),
      ...fromGroupCsv.errors,
    ]
    setValidationErrors(errors)

    const useGroupCsv = fromGroupCsv.isNewFormatDetected
    setImportMode(useGroupCsv ? 'group_csv' : 'legacy')
    setShowGroupPreviewColumns({
      province: useGroupCsv,
      league: useGroupCsv,
      prestige: useGroupCsv,
    })

    type Tagged = ParsedGameLine & { inputSource: 'textarea' | 'csv' }
    const merged: Tagged[] = useGroupCsv
      ? fromGroupCsv.rows.map((r) => ({
          lineNumber: r.lineNumber,
          raw: r.raw,
          ok: true as const,
          home_team: r.home_team,
          away_team: r.away_team,
          kickoff_time: r.kickoff_time,
          raw_date: r.raw_date,
          inputSource: 'csv' as const,
        }))
      : [
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
      const previewBase = buildPreviewRows(base, teams, teamAliasMap)
      const rows: FixturePreviewRow[] = []
      for (let i = 0; i < previewBase.length; i += 1) {
        const r = previewBase[i]
        const sourceRow = useGroupCsv ? fromGroupCsv.rows[i] : null
        const provinceGroupRaw = sourceRow?.provinceGroup ?? ''
        const leagueGroupRaw = sourceRow?.leagueGroup ?? ''
        const provinceResolved = await resolveFixtureGroupForPreview(provinceGroupRaw)
        const leagueResolved = await resolveFixtureGroupForPreview(leagueGroupRaw)
        rows.push({
          ...r,
          source: merged[i].inputSource,
          provinceGroup: provinceGroupRaw,
          leagueGroup: leagueGroupRaw,
          provinceGroupRaw,
          provinceGroupResolved: provinceResolved.resolvedName,
          provinceGroupIsNew: provinceResolved.isNew,
          leagueGroupRaw,
          leagueGroupResolved: leagueResolved.resolvedName,
          leagueGroupIsNew: leagueResolved.isNew,
          prestige: sourceRow?.prestige ?? false,
          status: sourceRow?.status ?? 'upcoming',
        })
      }

      if (useGroupCsv) {
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i]
          const home = teamById.get(r.homeTeamId ?? -1)?.name
          const away = teamById.get(r.awayTeamId ?? -1)?.name
          if (!home || !away || !r.kickoff_time) {
            rows[i] = { ...r, previewAction: 'error', previewError: 'Missing mapped teams or kickoff.' }
            continue
          }
          const { data: existing } = await supabase
            .from('game_matches')
            .select('id')
            .eq('home_team', home)
            .eq('away_team', away)
            .eq('kickoff_time', r.kickoff_time)
            .maybeSingle()
          rows[i] = { ...r, previewAction: existing?.id ? 'update' : 'create', previewError: null }
        }
      }
      setPreviewRows(rows)
      setMessage(`Preview: ${rows.length} row(s). Review and confirm before insert.`)
    } finally {
      setPreviewLoading(false)
    }
  }

  function slugifyGroupName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

type GroupResolvePreview = {
  id: string | null
  resolvedName: string
  isNew: boolean
}

async function resolveFixtureGroupForPreview(rawInput: string): Promise<GroupResolvePreview> {
  const raw = rawInput.trim()
  if (!raw) return { id: null, resolvedName: '', isNew: false }

  const { data: aliasRow } = await supabase
    .from('fixture_group_aliases')
    .select('group_id, fixture_groups(name)')
    .ilike('alias', raw)
    .maybeSingle()
  if (aliasRow?.group_id) {
    const fg = aliasRow as {
      group_id: string
      fixture_groups: { name?: string } | { name?: string }[] | null
    }
    const fgr = Array.isArray(fg.fixture_groups) ? fg.fixture_groups[0] : fg.fixture_groups
    return {
      id: String(fg.group_id),
      resolvedName: String(fgr?.name ?? raw),
      isNew: false,
    }
  }

  const { data: byName } = await supabase
    .from('fixture_groups')
    .select('id, name')
    .ilike('name', raw)
    .maybeSingle()
  if (byName?.id) {
    return {
      id: String(byName.id),
      resolvedName: String(byName.name ?? raw),
      isNew: false,
    }
  }

  const slug = slugifyGroupName(raw)
  if (slug) {
    const { data: bySlug } = await supabase
      .from('fixture_groups')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()
    if (bySlug?.id) {
      return {
        id: String(bySlug.id),
        resolvedName: String(bySlug.name ?? raw),
        isNew: false,
      }
    }
  }

  return {
    id: null,
    resolvedName: raw,
    isNew: true,
  }
}

  async function ensureFixtureGroupId(
    name: string,
    cache: Map<string, string>,
    createdNames: Set<string>
  ): Promise<string | null> {
    const raw = name.trim()
    if (!raw) return null

    const aliasKey = `alias:${raw.toLowerCase()}`
    const cachedAlias = cache.get(aliasKey)
    if (cachedAlias) return cachedAlias

    // 1) Alias table first (case-insensitive).
    const { data: aliasRow, error: aliasErr } = await supabase
      .from('fixture_group_aliases')
      .select('group_id')
      .ilike('alias', raw)
      .maybeSingle()
    if (aliasErr) throw new Error(aliasErr.message)
    if (aliasRow?.group_id) {
      const id = String(aliasRow.group_id)
      cache.set(aliasKey, id)
      const slugKey = slugifyGroupName(raw)
      if (slugKey) cache.set(slugKey, id)
      return id
    }

    // 2) Canonical group by name (case-insensitive).
    const nameKey = `name:${raw.toLowerCase()}`
    const cachedName = cache.get(nameKey)
    if (cachedName) return cachedName
    const { data: byName, error: byNameErr } = await supabase
      .from('fixture_groups')
      .select('id, slug')
      .ilike('name', raw)
      .maybeSingle()
    if (byNameErr) throw new Error(byNameErr.message)
    if (byName?.id) {
      const id = String(byName.id)
      cache.set(nameKey, id)
      if (byName.slug) cache.set(String(byName.slug), id)
      return id
    }

    // 3) Fallback by slug, then create only if not found.
    const slug = slugifyGroupName(raw)
    if (!slug) return null
    const cached = cache.get(slug)
    if (cached) return cached

    const { data: existing, error: findErr } = await supabase
      .from('fixture_groups')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()
    if (findErr) throw new Error(findErr.message)
    if (existing?.id) {
      cache.set(slug, existing.id as string)
      return existing.id as string
    }

    const { data: created, error: createErr } = await supabase
      .from('fixture_groups')
      .insert({ name: raw, slug, is_active: true })
      .select('id, name')
      .single()
    if (createErr) throw new Error(createErr.message)
    cache.set(slug, created.id as string)
    createdNames.add(String(created.name ?? raw))
    return created.id as string
  }

  async function insertConfirmed() {
    setMessage('')
    const insertable = previewRows.filter((r) => canInsertRow(r, teamById))
    const skippedOrErrorCount = previewRows.filter((r) => r.parseError || r.removed || !canInsertRow(r, teamById)).length
    if (insertable.length === 0) {
      setMessage('No confirmed rows to insert. Confirm rows with both teams matched, or fix unknowns.')
      return
    }

    setSubmitting(true)
    let insertedCount = 0
    let updatedCount = 0
    const createdGroups = new Set<string>()

    if (importMode === 'legacy') {
      const shapeErr = validatePreviewFeaturedShape(insertable)
      if (shapeErr) {
        setMessage(shapeErr)
        setSubmitting(false)
        return
      }

      const { data: liveRows, error: liveErr } = await supabase
        .from('game_matches')
        .select('id, is_featured, featured_order')
        .in('status', ['upcoming', 'locked'])

      if (liveErr) {
        setMessage(`Could not validate featured slots: ${liveErr.message}`)
        setSubmitting(false)
        return
      }

      const featuredErr = validatePreviewFeaturedRowsForInsert(
        insertable,
        (liveRows ?? []) as LiveFeaturedRow[]
      )
      if (featuredErr) {
        setMessage(featuredErr)
        setSubmitting(false)
        return
      }

      const rows = insertable.map((r) => ({
        home_team: teamById.get(r.homeTeamId!)!.name,
        away_team: teamById.get(r.awayTeamId!)!.name,
        kickoff_time: r.kickoff_time,
        status: 'upcoming' as const,
        is_featured: r.isFeatured,
        featured_order: null,
        province_group: null as string | null,
        league_group: null as string | null,
        is_prestige: false,
      }))

      const { data: inserted, error } = await supabase.from('game_matches').insert(rows).select('id')
      if (error) {
        setMessage(`Insert failed: ${error.message}`)
        setSubmitting(false)
        return
      }
      insertedCount = inserted?.length ?? rows.length
    } else {
      const groupIdBySlug = new Map<string, string>()
      for (const r of insertable) {
        const home = teamById.get(r.homeTeamId!)!.name
        const away = teamById.get(r.awayTeamId!)!.name
        const status = r.status ?? 'upcoming'

        const { data: existing, error: existingErr } = await supabase
          .from('game_matches')
          .select('id')
          .eq('home_team', home)
          .eq('away_team', away)
          .eq('kickoff_time', r.kickoff_time)
          .maybeSingle()
        if (existingErr) {
          setMessage(`Upsert check failed: ${existingErr.message}`)
          setSubmitting(false)
          return
        }

        let matchId: string
        if (existing?.id) {
          const { error: updateErr } = await supabase
            .from('game_matches')
            .update({
              status,
              province_group: r.provinceGroup ?? null,
              league_group: r.leagueGroup ?? null,
              is_prestige: !!r.prestige,
            })
            .eq('id', existing.id)
          if (updateErr) {
            setMessage(`Update failed: ${updateErr.message}`)
            setSubmitting(false)
            return
          }
          updatedCount += 1
          matchId = String(existing.id)
        } else {
          const { data: ins, error: insertErr } = await supabase
            .from('game_matches')
            .insert({
              home_team: home,
              away_team: away,
              kickoff_time: r.kickoff_time,
              status,
              home_score: null,
              away_score: null,
              is_featured: false,
              featured_order: null,
              province_group: r.provinceGroup ?? null,
              league_group: r.leagueGroup ?? null,
              is_prestige: !!r.prestige,
            })
            .select('id')
            .single()
          if (insertErr || !ins?.id) {
            setMessage(`Insert failed: ${insertErr?.message ?? 'Unknown insert error'}`)
            setSubmitting(false)
            return
          }
          insertedCount += 1
          matchId = String(ins.id)
        }

        const provinceGroupId = await ensureFixtureGroupId(
          r.provinceGroup ?? '',
          groupIdBySlug,
          createdGroups
        )
        const leagueGroupId = await ensureFixtureGroupId(
          r.leagueGroup ?? '',
          groupIdBySlug,
          createdGroups
        )
        const prestigeGroupId = r.prestige
          ? await ensureFixtureGroupId('Prestige Pool', groupIdBySlug, createdGroups)
          : null
        const toLink = [provinceGroupId, leagueGroupId, prestigeGroupId].filter(Boolean) as string[]
        if (toLink.length > 0) {
          const links = toLink.map((gid) => ({ match_id: matchId, group_id: gid }))
          const { error: linkErr } = await supabase
            .from('game_match_groups')
            .upsert(links, { onConflict: 'match_id,group_id', ignoreDuplicates: true })
          if (linkErr) {
            setMessage(`Group link failed: ${linkErr.message}`)
            setSubmitting(false)
            return
          }
        }

        // Province groups only: keep fixture_group_teams populated for canonical province groups.
        // Never auto-add for league groups or Prestige Pool.
        if (provinceGroupId) {
          const teamsToAdd = [home.trim(), away.trim()].filter(Boolean)
          if (teamsToAdd.length > 0) {
            const coreRows = [...new Set(teamsToAdd)].map((teamName) => ({
              group_id: provinceGroupId,
              team_name: teamName,
            }))
            const { error: coreTeamErr } = await supabase
              .from('fixture_group_teams')
              .upsert(coreRows, { onConflict: 'group_id,team_name', ignoreDuplicates: true })
            if (coreTeamErr) {
              setMessage(`Province core-team sync failed: ${coreTeamErr.message}`)
              setSubmitting(false)
              return
            }
          }
        }
      }
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

    let insertSummary =
      importMode === 'group_csv'
        ? `Inserted ${insertedCount} and updated ${updatedCount} game(s).`
        : `Inserted ${insertedCount} game(s).`
    if (aliasCandidates.length > 0) {
      const aliasResult = await insertNewTeamAliasesOnly(supabase, teams, aliasCandidates)
      if (aliasResult.error) {
        insertSummary += ` Team aliases: ${aliasResult.error}`
      } else if (aliasResult.warning) {
        insertSummary += ` Team aliases: ${aliasResult.warning}`
      } else if (aliasResult.inserted > 0) {
        insertSummary += ` Saved ${aliasResult.inserted} new team alias(es) (existing mappings were left unchanged).`
        await loadTeamsAndAliases()
      }
    }

    if (createdGroups.size > 0) {
      insertSummary += ` Created groups: ${[...createdGroups].join(', ')}.`
    }
    if (skippedOrErrorCount > 0) {
      insertSummary += ` Skipped/error rows: ${skippedOrErrorCount}.`
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
  const featuredShapeError = useMemo(() => {
    if (importMode === 'group_csv') return null
    return validatePreviewFeaturedShape(insertablePreview)
  }, [insertablePreview, importMode])
  const insertableCount = insertablePreview.length
  const needingAttentionCount = activePreview.filter((r) => !canInsertRow(r, teamById) && !r.parseError).length
  const parseErrorCount = activePreview.filter((r) => r.parseError).length
  const featuredSelectedCount = insertablePreview.filter((r) => r.isFeatured).length
  const prestigeInImportCount = insertablePreview.filter((r) => !!r.prestige).length

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
    const prev = fixtures.find((f) => f.id === matchId) ?? null
    const hadSavedResult = Boolean(prev && prev.status === 'completed' && prev.home_score != null && prev.away_score != null)

    const patch: Record<string, unknown> = {
      kickoff_time: kickIso,
      status: d.status,
      province_group: d.provinceGroup.trim() || null,
      league_group: d.leagueGroup.trim() || null,
      is_prestige: d.isPrestige,
    }
    if (d.status === 'completed') {
      patch.home_score = homeScore
      patch.away_score = awayScore
    } else {
      patch.home_score = null
      patch.away_score = null
    }

    const { error } = await supabase.from('game_matches').update(patch).eq('id', matchId)
    if (error) {
      setMessage(`Update failed: ${error.message}`)
      await loadFixtures()
      setRowBusyId(null)
      return
    }

    const shouldAutoScore = d.status === 'completed' && homeScore != null && awayScore != null
    if (shouldAutoScore) {
      const { error: scoreErr } = await supabase.rpc('score_predictions_for_match', { p_match_id: matchId })
      if (scoreErr) {
        setMessage('Result saved, but scoring failed. Please try Run scoring.')
      } else {
        setMessage(hadSavedResult ? 'Score updated and scoring updated.' : 'Score saved and scoring updated.')
      }
    } else {
      setMessage(hadSavedResult ? 'Score updated.' : 'Score saved.')
    }
    await loadFixtures()
    setRowBusyId(null)
  }

  async function runScoring(id: string) {
    setRowBusyId(id)
    const { data, error } = await supabase.rpc('score_predictions_for_match', { p_match_id: id })
    if (error) setMessage(`Scoring failed: ${error.message}`)
    else setMessage(`Scoring wrote ${data ?? 0} row(s) for this match.`)
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
      provinceGroup: string
      leagueGroup: string
      isPrestige: boolean
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
            Supported CSV format:
            <br />
            <code className="text-xs">
              Date, Home Team, Away Team, Kickoff Time, Province Group, League Group, Prestige, Status
            </code>
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Example:
            <br />
            <code className="text-xs">
              2026-05-10,Paarl Boys High,Grey College,13:30,Western Province,Prestige Pool,true,upcoming
            </code>
          </p>
          <p className="mt-2 text-xs font-medium text-gray-700">
            Re-uploading the same fixture will update it, not duplicate it.
          </p>
          <textarea
            className="mt-4 w-full min-h-[160px] rounded-lg border border-gray-300 p-3 font-mono text-sm"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Date,Home Team,Away Team,Kickoff Time,Province Group,League Group,Prestige,Status\n2026-05-10,Paarl Boys High,Grey College,13:30,Western Province,Prestige Pool,true,upcoming`}
            disabled={submitting || previewLoading}
          />
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-800">CSV upload (optional)</label>
            <p className="mt-1 text-xs text-gray-600">
              Headers: <code className="text-xs">Date,Home Team,Away Team,Kickoff Time,Province Group,League Group,Prestige,Status</code>.
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
              {previewLoading ? 'Validating…' : 'Validate CSV'}
            </button>
            <button
              type="button"
              onClick={() => void insertConfirmed()}
              disabled={
                submitting || previewRows.length === 0 || insertableCount === 0 || !!featuredShapeError
              }
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Importing…' : 'Import valid rows'}
            </button>
          </div>
          {featuredShapeError ? (
            <p className="mt-3 text-sm font-medium text-red-700">{featuredShapeError}</p>
          ) : null}
          {previewRows.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              Total (active): {activePreview.length} · Confirmed ready to insert: {insertableCount} · Needing attention:{' '}
              {needingAttentionCount}
              {parseErrorCount > 0 ? ` · Parse errors: ${parseErrorCount}` : ''}
              {importMode === 'legacy' ? ` · Featured in import: ${featuredSelectedCount}/${FEATURED_MATCHES_MAX}` : ''}
              {importMode === 'group_csv' ? ` · Prestige in import: ${prestigeInImportCount}` : ''}
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
                    {showGroupPreviewColumns.province ? <th className="py-2 pr-2">Province Group</th> : null}
                    {showGroupPreviewColumns.league ? <th className="py-2 pr-2">League Group</th> : null}
                    {showGroupPreviewColumns.prestige ? <th className="py-2 pr-2">Prestige</th> : null}
                    {importMode === 'legacy' ? <th className="py-2 pr-2">Featured</th> : null}
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
                        {showGroupPreviewColumns.province ? (
                          <td className="py-2 pr-2">
                            {r.provinceGroupRaw || '—'}
                            {r.provinceGroupRaw && r.provinceGroupIsNew ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">new group</p>
                            ) : null}
                            {r.provinceGroupRaw &&
                            !r.provinceGroupIsNew &&
                            r.provinceGroupResolved &&
                            r.provinceGroupResolved.toLowerCase() !== r.provinceGroupRaw.toLowerCase() ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">→ {r.provinceGroupResolved}</p>
                            ) : null}
                          </td>
                        ) : null}
                        {showGroupPreviewColumns.league ? (
                          <td className="py-2 pr-2">
                            {r.leagueGroupRaw || '—'}
                            {r.leagueGroupRaw && r.leagueGroupIsNew ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">new group</p>
                            ) : null}
                            {r.leagueGroupRaw &&
                            !r.leagueGroupIsNew &&
                            r.leagueGroupResolved &&
                            r.leagueGroupResolved.toLowerCase() !== r.leagueGroupRaw.toLowerCase() ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">→ {r.leagueGroupResolved}</p>
                            ) : null}
                          </td>
                        ) : null}
                        {showGroupPreviewColumns.prestige ? (
                          <td className="py-2 pr-2">{r.prestige ? 'Yes' : 'No'}</td>
                        ) : null}
                        {importMode === 'legacy' ? (
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
                        ) : null}
                        <td className="py-2 pr-2">{r.status || 'upcoming'}</td>
                        <td className="py-2 pr-2">
                          {r.parseError ? '—' : <span>{st}</span>}
                          {!r.parseError && r.confirmedForInsert && canInsertRow(r, teamById) && (
                            <span className="ml-1 text-green-700">· ready</span>
                          )}
                          {importMode === 'group_csv' && r.previewAction ? (
                            <span className="ml-1 text-blue-700">· {r.previewAction}</span>
                          ) : null}
                          {importMode === 'group_csv' && r.previewError ? (
                            <span className="ml-1 text-red-700">· {r.previewError}</span>
                          ) : null}
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
                toggles save immediately. Completed results auto-run scoring; use <strong>Re-run scoring</strong> if
                you need to retry.
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
                    <th className="py-2 pr-3">Groups</th>
                    <th className="py-2 pr-3">Scores</th>
                    <th className="py-2 pr-3">Featured</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((m) => {
                    const busy = rowBusyId === m.id
                    const fd = fixtureFieldDraft[m.id]
                    const hasSavedResult = Boolean(
                      fd && fd.status === 'completed' && fd.homeScore.trim() !== '' && fd.awayScore.trim() !== ''
                    )
                    const hasAnyScoreInDraft = Boolean(fd && (fd.homeScore.trim() !== '' || fd.awayScore.trim() !== ''))
                    const scoreStatusMismatch = Boolean(fd && hasAnyScoreInDraft && fd.status !== 'completed')
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
                              <option value="cancelled">cancelled</option>
                            </select>
                          ) : (
                            m.status
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {fd ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                placeholder="Province/group"
                                className="w-36 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                disabled={busy}
                                value={fd.provinceGroup}
                                onChange={(e) => patchFixtureField(m.id, { provinceGroup: e.target.value })}
                              />
                              <input
                                type="text"
                                placeholder="League/group"
                                className="w-36 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                disabled={busy}
                                value={fd.leagueGroup}
                                onChange={(e) => patchFixtureField(m.id, { leagueGroup: e.target.value })}
                              />
                              <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={fd.isPrestige}
                                  onChange={(e) => patchFixtureField(m.id, { isPrestige: e.target.checked })}
                                />
                                Prestige
                              </label>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {fd ? (
                            <div className="space-y-1.5">
                              {hasSavedResult ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                                    Score saved
                                  </span>
                                  <span className="text-xs font-semibold tabular-nums text-gray-900">
                                    {fd.homeScore} - {fd.awayScore}
                                  </span>
                                </div>
                              ) : null}
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
                              {scoreStatusMismatch ? (
                                <p className="text-[11px] font-medium text-amber-800">
                                  This match has a score but is not marked completed.
                                </p>
                              ) : null}
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
                              {hasSavedResult ? 'Update score' : 'Save result'}
                            </button>
                            <button
                              type="button"
                              disabled={busy || m.status !== 'completed'}
                              className="w-fit rounded border border-gray-400 px-2 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                              onClick={() => void runScoring(m.id)}
                            >
                              Re-run scoring
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
