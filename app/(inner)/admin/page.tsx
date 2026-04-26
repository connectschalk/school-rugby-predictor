'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'
import * as XLSX from 'xlsx'
import { downloadPngFromElement } from '@/lib/exportAsPng'
import ExportPredictionCard from '@/components/export/ExportPredictionCard'
import TeamLogoUploader from '@/components/TeamLogoUploader'
import PredictionCard from '@/components/admin/PredictionCard'
import PredictedVsActualCard from '@/components/admin/PredictedVsActualCard'
import { recordMatchResultWithPrediction } from '@/lib/admin-match'
import {
  backfillPredictionHistoryForSeason,
  clearPredictionHistoryForSeason,
} from '@/lib/backfill-prediction-history'
import {
  DEFAULT_CONSISTENCY_MODEL_SETTINGS,
  DEFAULT_STRONG_OPPONENT_BOOST_PARAMS,
  getConsistencyModelSettings,
  toStrongOpponentBoostParams,
  type ConsistencyModelSettings,
} from '@/lib/consistency-model-settings'
import {
  type Match as PredictorMatch,
  type TeamConsistencyRow,
  type StrongOpponentBoostParams,
  MAX_LINKS,
  buildGraph,
  calculateTeamConsistency,
  computeSeasonStrengthRatings,
  findAllPathsWithWeights,
  getConfidence,
} from '@/lib/prediction-model'
import { recalculateTeamConsistencyFromPredictionHistory } from '@/lib/team-consistency'
import { matchTeamName, type TeamMatchResult } from '@/lib/team-name-match'
import { fetchUserIsAdmin } from '@/lib/admin-access'

const ADMIN_TOOL_CARDS = [
  {
    href: '/predictor',
    title: 'Predictor',
    description: 'Head-to-head margin prediction between two teams.',
  },
  {
    href: '/rankings',
    title: 'Rankings tool',
    description: 'Internal pool rankings and season connectivity.',
  },
  {
    href: '/consistency',
    title: 'Consistency',
    description: 'Team consistency metrics and adjusted scores.',
  },
  {
    href: '/network',
    title: 'Graph',
    description: 'Visual network of teams, links, and margins.',
  },
  {
    href: '/results',
    title: 'Scores / Results',
    description: 'Browse and search match results by season.',
  },
  {
    href: '/admin/game-matches',
    title: 'Game matches',
    description: 'Bulk fixtures and Predict a Score match admin.',
  },
  {
    href: '/tools',
    title: 'Tools hub',
    description: 'Shortcuts to all internal analysis tools.',
  },
] as const

function formatTeamMatchLabel(m: TeamMatchResult): string {
  const pct = m.matchConfidence != null ? ` ${Math.round(m.matchConfidence * 100)}%` : ''
  const review = m.needsReview ? ' · review' : ''
  return `${m.matchMethod}${pct}${review}`
}

function newUrlImportRowKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `url-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type Team = {
  id: number
  name: string
  logo_url?: string | null
}

type MatchRow = {
  id: number
  season: number
  match_date: string
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
  team_a_name: string
  team_b_name: string
}

/** Row from `matches` for Predicted vs Actual fixture picker (all seasons for a calendar date). */
type PvaFixtureRow = {
  id: number
  match_date: string
  season: number
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
}

type UploadPreviewRow = {
  match_date: string
  team_a: string
  team_b: string
  team_a_score: number
  team_b_score: number
}

type UrlImportPreviewRow = {
  key: string
  match_date: string
  team_a_name: string
  team_b_name: string
  team_a_score: number
  team_b_score: number
  team_a_id: number | null
  team_b_id: number | null
  team_a_label: string
  team_b_label: string
  team_a_conf: number | null
  team_b_conf: number | null
  removed: boolean
}

type UsageEvent = {
  id: number
  created_at: string
  event_type: string
  page: string | null
  details: Record<string, any> | null
  user_email: string | null
  session_id: string | null
}

type SocialFormat = 'square' | 'portrait'
type StudioTab = 'match' | 'rankings' | 'pva'

export default function AdminPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')

  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [seasonFilter, setSeasonFilter] = useState('2026')
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(true)

  const [schoolName, setSchoolName] = useState('')
  const [schoolMessage, setSchoolMessage] = useState('')

  const [matchMessage, setMatchMessage] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')

  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadRows, setUploadRows] = useState<UploadPreviewRow[]>([])
  const [uploading, setUploading] = useState(false)

  const [resultsUrl, setResultsUrl] = useState('')
  const [urlImportParsing, setUrlImportParsing] = useState(false)
  const [urlImportRows, setUrlImportRows] = useState<UrlImportPreviewRow[]>([])
  const [urlImportMessage, setUrlImportMessage] = useState('')
  const [urlParseNotes, setUrlParseNotes] = useState<string[]>([])
  const [urlFallbackDate, setUrlFallbackDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [urlImporting, setUrlImporting] = useState(false)

  const [consistencyMessage, setConsistencyMessage] = useState('')
  const [recalculatingConsistency, setRecalculatingConsistency] = useState(false)

  const [backfillSeason, setBackfillSeason] = useState('2026')
  const [backfillMessage, setBackfillMessage] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  type ConsistencyModelForm = Omit<ConsistencyModelSettings, 'season'>
  const [consistencyModelForm, setConsistencyModelForm] = useState<ConsistencyModelForm>({
    ...DEFAULT_CONSISTENCY_MODEL_SETTINGS,
  })
  const [consistencyModelUpdatedAt, setConsistencyModelUpdatedAt] = useState<string | null>(null)
  const [consistencyModelMessage, setConsistencyModelMessage] = useState('')
  const [consistencyModelLoading, setConsistencyModelLoading] = useState(false)
  const [savingConsistencyModel, setSavingConsistencyModel] = useState(false)

  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([])
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [usageMessage, setUsageMessage] = useState('')

  const [activeAdminTab, setActiveAdminTab] = useState<'add-delete' | 'usage' | 'scores' | 'social'>('add-delete')
  const [activeAddDeleteTab, setActiveAddDeleteTab] = useState<
    'school' | 'match' | 'bulk' | 'logo' | 'delete-team'
  >('school')
  const [showRecentActivity, setShowRecentActivity] = useState(false)
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>('match')
  const [teamToDeleteId, setTeamToDeleteId] = useState('')
  const [teamDeleteMessage, setTeamDeleteMessage] = useState('')

  const [matchImageForm, setMatchImageForm] = useState({
    homeTeam: '',
    awayTeam: '',
    matchDate: new Date().toISOString().slice(0, 10),
    rationale: 'Based on connected results and network strength.',
    format: 'square' as SocialFormat,
  })

  const [rankingsImageForm, setRankingsImageForm] = useState({
    format: 'square' as SocialFormat,
    limit: 10 as 5 | 10,
    pool: 'all',
  })

  const [pvaImageForm, setPvaImageForm] = useState({
    homeTeam: '',
    awayTeam: '',
    matchDate: new Date().toISOString().slice(0, 10),
    predictedMargin: '',
    actualHomeScore: '',
    actualAwayScore: '',
    format: 'square' as SocialFormat,
    /** From prediction_history.prediction_error when loaded from DB */
    predictionError: null as number | null,
    manualOverride: false,
  })
  const [pvaLoading, setPvaLoading] = useState(false)
  const [pvaAutoMessage, setPvaAutoMessage] = useState('')

  const [pvaFixturesForDate, setPvaFixturesForDate] = useState<PvaFixtureRow[]>([])
  const [pvaSelectedFixtureId, setPvaSelectedFixtureId] = useState('')
  const [pvaFixtureLoading, setPvaFixtureLoading] = useState(false)
  const [pvaFixtureMessage, setPvaFixtureMessage] = useState('')
  /** When false, Home/Away are driven by the Played Fixture dropdown (default). */
  const [pvaManualTeamPick, setPvaManualTeamPick] = useState(false)

  const matchCardRef = useRef<HTMLDivElement | null>(null)
  const rankingsCardRef = useRef<HTMLDivElement | null>(null)
  const pvaCardRef = useRef<HTMLDivElement | null>(null)
  const pvaLoadGenRef = useRef(0)
  const pvaApplyFixtureGenRef = useRef(0)
  const [studioMessage, setStudioMessage] = useState('')

  const [studioTeamConsistencyByTeamId, setStudioTeamConsistencyByTeamId] = useState<
    Map<number, TeamConsistencyRow>
  >(new Map())
  const [studioStrongOpponentBoostParams, setStudioStrongOpponentBoostParams] =
    useState<StrongOpponentBoostParams>(DEFAULT_STRONG_OPPONENT_BOOST_PARAMS)

  const [form, setForm] = useState({
    match_date: '',
    team_a_id: '',
    team_b_id: '',
    team_a_score: '',
    team_b_score: '',
  })

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

      setAdminEmail(session.user.email ?? '')
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

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (!authChecked) return
    trackEvent('page_view', 'admin')
  }, [authChecked])

  async function loadTeams() {
    setLoadingTeams(true)

    const { data, error } = await supabase
      .from('teams')
      .select('id, name, logo_url')
      .order('name')

    if (!error) {
      setTeams((data as Team[]) || [])
    }

    setLoadingTeams(false)
  }

  async function loadMatches() {
    setLoadingMatches(true)

    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        season,
        match_date,
        team_a_id,
        team_b_id,
        team_a_score,
        team_b_score,
        team_a:teams!matches_team_a_id_fkey(name),
        team_b:teams!matches_team_b_id_fkey(name)
      `)
      .eq('season', Number(seasonFilter))
      .order('match_date', { ascending: false })

    if (!error && data) {
      const formatted = data.map((m: any) => ({
        id: m.id,
        season: m.season,
        match_date: m.match_date,
        team_a_id: m.team_a_id,
        team_b_id: m.team_b_id,
        team_a_score: m.team_a_score,
        team_b_score: m.team_b_score,
        team_a_name: m.team_a.name,
        team_b_name: m.team_b.name,
      }))

      setMatches(formatted)
    } else {
      setMatches([])
    }

    setLoadingMatches(false)
  }

  async function loadUsageEvents() {
    setLoadingUsage(true)
    setUsageMessage('')

    const { data, error } = await supabase
      .from('usage_events')
      .select('id, created_at, event_type, page, details, user_email, session_id')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setUsageMessage(`Could not load usage events: ${error.message}`)
      setUsageEvents([])
    } else {
      setUsageEvents((data as UsageEvent[]) || [])
    }

    setLoadingUsage(false)
  }

  useEffect(() => {
    if (!authChecked) return
    loadTeams()
    loadUsageEvents()
  }, [authChecked])

  useEffect(() => {
    if (!authChecked) return
    loadMatches()
  }, [seasonFilter, authChecked])

  useEffect(() => {
    if (activeAdminTab === 'scores') {
      setBackfillSeason(seasonFilter)
    }
  }, [activeAdminTab, seasonFilter])

  useEffect(() => {
    if (!authChecked) return
    let cancelled = false

    async function loadStudioPredictionModelData() {
      const season = Number(seasonFilter)
      if (Number.isNaN(season)) return

      const [tcRes, settings] = await Promise.all([
        supabase
          .from('team_consistency')
          .select('team_id, adjusted_consistency, consistency_score, is_anchor, anchor_status')
          .eq('season', season),
        getConsistencyModelSettings(supabase, season),
      ])

      if (cancelled) return

      const map = new Map<number, TeamConsistencyRow>()
      if (!tcRes.error && tcRes.data) {
        for (const row of tcRes.data as TeamConsistencyRow[]) {
          map.set(row.team_id, row)
        }
      }
      setStudioTeamConsistencyByTeamId(map)
      setStudioStrongOpponentBoostParams(toStrongOpponentBoostParams(settings))
    }

    loadStudioPredictionModelData()
    return () => {
      cancelled = true
    }
  }, [authChecked, seasonFilter])

  useEffect(() => {
    if (!authChecked || activeAdminTab !== 'scores') return
    let cancelled = false

    async function loadConsistencyModelUi() {
      const season = Number(seasonFilter)
      if (Number.isNaN(season)) return

      setConsistencyModelLoading(true)
      setConsistencyModelMessage('')

      const s = await getConsistencyModelSettings(supabase, season)
      const { data: meta, error: metaError } = await supabase
        .from('consistency_model_settings')
        .select('updated_at')
        .eq('season', season)
        .maybeSingle()

      if (cancelled) return

      if (metaError) {
        setConsistencyModelMessage(`Could not load settings metadata: ${metaError.message}`)
      }

      setConsistencyModelForm({
        error_divisor: s.error_divisor,
        min_trust_floor: s.min_trust_floor,
        trusted_anchor_min_matches: s.trusted_anchor_min_matches,
        trusted_anchor_min_adjusted_consistency: s.trusted_anchor_min_adjusted_consistency,
        usable_reference_min_matches: s.usable_reference_min_matches,
        usable_reference_min_adjusted_consistency: s.usable_reference_min_adjusted_consistency,
        unstable_min_matches: s.unstable_min_matches,
        strong_opponent_step: s.strong_opponent_step,
        max_strong_opponent_count: s.max_strong_opponent_count,
      })
      setConsistencyModelUpdatedAt((meta as { updated_at?: string } | null)?.updated_at ?? null)
      setConsistencyModelLoading(false)
    }

    loadConsistencyModelUi()
    return () => {
      cancelled = true
    }
  }, [authChecked, activeAdminTab, seasonFilter])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleAddSchool(e: React.FormEvent) {
    e.preventDefault()
    setSchoolMessage('')

    const cleanedName = schoolName.trim()

    if (!cleanedName) {
      setSchoolMessage('Please enter a school name.')
      return
    }

    const { error } = await supabase.from('teams').insert([{ name: cleanedName }])

    if (error) {
      setSchoolMessage(`Could not add school: ${error.message}`)
      return
    }

    setSchoolMessage('School added successfully.')
    setSchoolName('')
    await loadTeams()

    await trackEvent('admin_add_school', 'admin', {
      schoolName: cleanedName,
    })
    await loadUsageEvents()
  }

  async function handleAddMatch(e: React.FormEvent) {
    e.preventDefault()
    setMatchMessage('')

    if (
      !form.match_date ||
      !form.team_a_id ||
      !form.team_b_id ||
      form.team_a_id === form.team_b_id ||
      form.team_a_score === '' ||
      form.team_b_score === ''
    ) {
      setMatchMessage('Please complete all fields correctly.')
      return
    }

    const season = new Date(form.match_date).getFullYear()
    const savedMatchDate = form.match_date
    const teamAId = Number(form.team_a_id)
    const teamBId = Number(form.team_b_id)
    const teamAScore = Number(form.team_a_score)
    const teamBScore = Number(form.team_b_score)

    const { data: existing } = await supabase
      .from('matches')
      .select('id')
      .eq('match_date', form.match_date)
      .eq('team_a_id', teamAId)
      .eq('team_b_id', teamBId)
      .eq('team_a_score', teamAScore)
      .eq('team_b_score', teamBScore)
      .limit(1)

    if (existing && existing.length > 0) {
      setMatchMessage('This exact match result already exists.')
      return
    }

    const inserted = await recordMatchResultWithPrediction(supabase, {
      match_date: form.match_date,
      season,
      team_a_id: teamAId,
      team_b_id: teamBId,
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      teams,
    })

    if (!inserted.ok) {
      setMatchMessage(`Could not save result: ${inserted.error}`)
      return
    }

    setMatchMessage('Match saved successfully.')

    const homeName = teams.find((t) => String(t.id) === form.team_a_id)?.name || form.team_a_id
    const awayName = teams.find((t) => String(t.id) === form.team_b_id)?.name || form.team_b_id

    setForm({
      match_date: '',
      team_a_id: '',
      team_b_id: '',
      team_a_score: '',
      team_b_score: '',
    })

    if (String(season) !== seasonFilter) {
      setSeasonFilter(String(season))
    } else {
      await loadMatches()
    }

    await trackEvent('admin_add_match', 'admin', {
      season,
      match_date: savedMatchDate,
      homeTeam: homeName,
      awayTeam: awayName,
    })
    await loadUsageEvents()
  }

  async function handleDeleteMatch(matchId: number) {
    const confirmed = window.confirm('Delete this match result?')
    if (!confirmed) return

    setDeleteMessage('')

    const matchToDelete = matches.find((m) => m.id === matchId)

    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', matchId)

    if (error) {
      setDeleteMessage(`Could not delete result: ${error.message}`)
      return
    }

    setDeleteMessage('Match deleted successfully.')
    await loadMatches()

    if (matchToDelete) {
      await recalculateTeamConsistencyFromPredictionHistory(supabase, matchToDelete.season, teams)
    }

    await trackEvent('admin_delete_match', 'admin', {
      matchId,
      fixture: matchToDelete
        ? `${matchToDelete.team_a_name} ${matchToDelete.team_a_score} - ${matchToDelete.team_b_score} ${matchToDelete.team_b_name}`
        : null,
    })
    await loadUsageEvents()
  }

  async function handleDeleteTeam() {
    setTeamDeleteMessage('')

    if (!teamToDeleteId) {
      setTeamDeleteMessage('Please select a team to delete.')
      return
    }

    const selectedTeam = teams.find((team) => String(team.id) === teamToDeleteId)
    if (!selectedTeam) {
      setTeamDeleteMessage('Selected team not found.')
      return
    }

    const confirmed = window.confirm(
      `Delete ${selectedTeam.name}? This will remove team consistency entries, all linked matches, and the team itself.`
    )
    if (!confirmed) return

    const teamId = Number(teamToDeleteId)

    const { error: consistencyError } = await supabase
      .from('team_consistency')
      .delete()
      .eq('team_id', teamId)

    if (consistencyError) {
      setTeamDeleteMessage(`Could not delete team consistency rows: ${consistencyError.message}`)
      return
    }

    const { error: matchesAsTeamAError } = await supabase
      .from('matches')
      .delete()
      .eq('team_a_id', teamId)

    if (matchesAsTeamAError) {
      setTeamDeleteMessage(`Could not delete team matches: ${matchesAsTeamAError.message}`)
      return
    }

    const { error: matchesAsTeamBError } = await supabase
      .from('matches')
      .delete()
      .eq('team_b_id', teamId)

    if (matchesAsTeamBError) {
      setTeamDeleteMessage(`Could not delete team matches: ${matchesAsTeamBError.message}`)
      return
    }

    const { error: teamDeleteError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (teamDeleteError) {
      setTeamDeleteMessage(`Could not delete team: ${teamDeleteError.message}`)
      return
    }

    setTeamDeleteMessage(`${selectedTeam.name} and linked data deleted successfully.`)
    setTeamToDeleteId('')
    await loadTeams()
    await loadMatches()

    await trackEvent('admin_delete_team', 'admin', {
      teamId,
      teamName: selectedTeam.name,
    })
    await loadUsageEvents()
  }

  function excelDateToIso(value: any): string {
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (!parsed) return ''
      const yyyy = parsed.y
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10)
    }

    const str = String(value || '').trim()
    if (!str) return ''

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str
    }

    const parsed = new Date(str)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }

    return ''
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadMessage('')
    setUploadRows([])

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
      })

      if (!rawRows.length) {
        setUploadMessage('The Excel sheet is empty.')
        return
      }

      const parsedRows: UploadPreviewRow[] = rawRows
        .map((row) => ({
          match_date: excelDateToIso(row.match_date),
          team_a: String(row.team_a || '').trim(),
          team_b: String(row.team_b || '').trim(),
          team_a_score: Number(row.team_a_score),
          team_b_score: Number(row.team_b_score),
        }))
        .filter(
          (row) =>
            row.match_date &&
            row.team_a &&
            row.team_b &&
            !Number.isNaN(row.team_a_score) &&
            !Number.isNaN(row.team_b_score)
        )

      if (!parsedRows.length) {
        setUploadMessage(
          'No valid rows found. Please use columns: match_date, team_a, team_b, team_a_score, team_b_score'
        )
        return
      }

      setUploadRows(parsedRows)
      setUploadMessage(`Loaded ${parsedRows.length} row(s). Review and click Import weekly scores.`)
    } catch {
      setUploadMessage('Could not read the Excel file.')
    }
  }

  async function handleImportRows() {
    setUploadMessage('')

    if (!uploadRows.length) {
      setUploadMessage('No rows loaded to import.')
      return
    }

    setUploading(true)

    try {
      const teamMap = new Map<string, number>()
      teams.forEach((team) => teamMap.set(team.name.trim().toLowerCase(), team.id))

      const validRows: any[] = []
      const failedRows: string[] = []
      let duplicateCount = 0

      for (const row of uploadRows) {
        const teamAId = teamMap.get(row.team_a.trim().toLowerCase())
        const teamBId = teamMap.get(row.team_b.trim().toLowerCase())

        if (!teamAId || !teamBId) {
          failedRows.push(
            `${row.match_date} | ${row.team_a} vs ${row.team_b} - school name not found`
          )
          continue
        }

        if (teamAId === teamBId) {
          failedRows.push(
            `${row.match_date} | ${row.team_a} vs ${row.team_b} - same team selected`
          )
          continue
        }

        const season = new Date(row.match_date).getFullYear()

        const { data: existing } = await supabase
          .from('matches')
          .select('id')
          .eq('match_date', row.match_date)
          .eq('team_a_id', teamAId)
          .eq('team_b_id', teamBId)
          .eq('team_a_score', row.team_a_score)
          .eq('team_b_score', row.team_b_score)
          .limit(1)

        if (existing && existing.length > 0) {
          duplicateCount += 1
          continue
        }

        validRows.push({
          match_date: row.match_date,
          season,
          team_a_id: teamAId,
          team_b_id: teamBId,
          team_a_score: row.team_a_score,
          team_b_score: row.team_b_score,
        })
      }

      if (validRows.length > 0) {
        const { error } = await supabase.from('matches').insert(validRows)

        if (error) {
          setUploadMessage(`Import failed: ${error.message}`)
          setUploading(false)
          return
        }
      }

      const importedSeasons = [...new Set(validRows.map((r) => String(r.season)))]
      if (importedSeasons.length === 1) {
        setSeasonFilter(importedSeasons[0])
      } else {
        await loadMatches()
      }

      let message = `Import complete. Added ${validRows.length} row(s).`
      if (duplicateCount > 0) {
        message += ` Skipped ${duplicateCount} duplicate row(s).`
      }
      if (failedRows.length > 0) {
        message += ` ${failedRows.length} row(s) failed.`
      }

      setUploadMessage(message)

      if (failedRows.length > 0) {
        console.log('Failed import rows:', failedRows)
      }

      setUploadRows([])
      await loadMatches()

      // Bulk rows skip prediction_history; call `recordMatchResultWithPrediction` per row later to align with single-add flow.

      await trackEvent('admin_bulk_upload', 'admin', {
        season: seasonFilter,
        rowsAdded: validRows.length,
        duplicateRows: duplicateCount,
        failedRows: failedRows.length,
      })
      await loadUsageEvents()
    } finally {
      setUploading(false)
    }
  }

  function buildUrlImportRowsFromParsed(
    apiRows: Array<{
      match_date: string
      team_a_name: string
      team_b_name: string
      team_a_score: number
      team_b_score: number
    }>,
    teamList: Team[],
    fallbackDate: string
  ): UrlImportPreviewRow[] {
    return apiRows.map((r) => {
      const match_date = r.match_date || fallbackDate
      const ma = matchTeamName(r.team_a_name, teamList)
      const mb = matchTeamName(r.team_b_name, teamList)
      return {
        key: newUrlImportRowKey(),
        match_date,
        team_a_name: r.team_a_name,
        team_b_name: r.team_b_name,
        team_a_score: r.team_a_score,
        team_b_score: r.team_b_score,
        team_a_id: ma.matchedTeamId,
        team_b_id: mb.matchedTeamId,
        team_a_label: formatTeamMatchLabel(ma),
        team_b_label: formatTeamMatchLabel(mb),
        team_a_conf: ma.matchConfidence,
        team_b_conf: mb.matchConfidence,
        removed: false,
      }
    })
  }

  async function handleParseResultsUrl() {
    setUrlImportMessage('')
    setUrlParseNotes([])
    setUrlImportRows([])
    const trimmed = resultsUrl.trim()
    if (!trimmed) {
      setUrlImportMessage('Paste a results URL first.')
      return
    }
    if (!teams.length) {
      setUrlImportMessage('Teams are still loading. Wait a moment and try again.')
      return
    }

    setUrlImportParsing(true)
    try {
      const res = await fetch('/api/parse-results-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (!data.ok) {
        setUrlImportMessage(data.error || 'Could not parse URL.')
        return
      }
      setUrlParseNotes(Array.isArray(data.notes) ? data.notes : [])
      const rows = buildUrlImportRowsFromParsed(data.rows || [], teams, urlFallbackDate)
      setUrlImportRows(rows)
      if (!rows.length) {
        setUrlImportMessage('No score rows found. Check the page format or try another URL.')
      } else {
        setUrlImportMessage(
          `Parsed ${rows.length} match row(s). Review team mapping, then import approved scores.`
        )
      }
    } catch {
      setUrlImportMessage('Request failed. Check the URL and try again.')
    } finally {
      setUrlImportParsing(false)
    }
  }

  async function checkUrlRowDuplicate(row: UrlImportPreviewRow): Promise<boolean> {
    if (!row.team_a_id || !row.team_b_id) return false
    const { data: a } = await supabase
      .from('matches')
      .select('id')
      .eq('match_date', row.match_date)
      .eq('team_a_id', row.team_a_id)
      .eq('team_b_id', row.team_b_id)
      .eq('team_a_score', row.team_a_score)
      .eq('team_b_score', row.team_b_score)
      .limit(1)
    if (a && a.length > 0) return true

    const { data: b } = await supabase
      .from('matches')
      .select('id')
      .eq('match_date', row.match_date)
      .eq('team_a_id', row.team_b_id)
      .eq('team_b_id', row.team_a_id)
      .eq('team_a_score', row.team_b_score)
      .eq('team_b_score', row.team_a_score)
      .limit(1)
    return (b?.length ?? 0) > 0
  }

  async function handleImportApprovedUrlScores() {
    setUrlImportMessage('')
    const active = urlImportRows.filter((r) => !r.removed)
    if (!active.length) {
      setUrlImportMessage('No rows to import.')
      return
    }

    const unresolved = active.filter((r) => !r.team_a_id || !r.team_b_id)
    if (unresolved.length > 0) {
      setUrlImportMessage(
        `Resolve all team mappings before import (${unresolved.length} row(s) still missing a team id).`
      )
      return
    }

    setUrlImporting(true)
    let inserted = 0
    let duplicates = 0
    let failed = 0

    try {
      for (const row of active) {
        if (row.team_a_id === row.team_b_id) {
          failed += 1
          continue
        }

        const isDup = await checkUrlRowDuplicate(row)
        if (isDup) {
          duplicates += 1
          continue
        }

        const season = new Date(row.match_date).getFullYear()
        const result = await recordMatchResultWithPrediction(supabase, {
          match_date: row.match_date,
          season,
          team_a_id: row.team_a_id!,
          team_b_id: row.team_b_id!,
          team_a_score: row.team_a_score,
          team_b_score: row.team_b_score,
          teams,
        })

        if (result.ok) {
          inserted += 1
        } else {
          failed += 1
        }
      }

      const removed = urlImportRows.filter((r) => r.removed).length
      let msg = `Import finished. Inserted ${inserted}.`
      if (duplicates > 0) msg += ` Skipped ${duplicates} duplicate(s).`
      if (failed > 0) msg += ` Failed ${failed} row(s).`
      if (removed > 0) msg += ` (${removed} row(s) were removed from the preview.)`
      setUrlImportMessage(msg)

      setUrlImportRows([])
      setResultsUrl('')
      await loadMatches()
      await trackEvent('admin_url_import', 'admin', {
        inserted,
        duplicates,
        failed,
        parsedTotal: active.length,
      })
      await loadUsageEvents()
    } finally {
      setUrlImporting(false)
    }
  }

  function getWeekNumberInSeason(dateStr: string) {
    const date = new Date(dateStr)
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const diffMs = date.getTime() - startOfYear.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.floor(diffDays / 7) + 1
  }

  async function handleSaveConsistencyModelSettings() {
    setConsistencyModelMessage('')
    setSavingConsistencyModel(true)
    try {
      const season = Number(seasonFilter)
      if (Number.isNaN(season)) {
        setConsistencyModelMessage('Invalid season.')
        return
      }

      const updated_at = new Date().toISOString()
      const { error } = await supabase.from('consistency_model_settings').upsert(
        {
          season,
          ...consistencyModelForm,
          updated_at,
        },
        { onConflict: 'season' }
      )

      if (error) {
        setConsistencyModelMessage(`Save failed: ${error.message}`)
        return
      }

      setConsistencyModelMessage('Settings saved.')
      setConsistencyModelUpdatedAt(updated_at)
      await trackEvent('admin_consistency_model_settings_save', 'admin', { season })
      await loadUsageEvents()
    } finally {
      setSavingConsistencyModel(false)
    }
  }

  async function handleRecalculateConsistency() {
    setConsistencyMessage('')
    setRecalculatingConsistency(true)

    try {
      const season = Number(seasonFilter)
      const result = await recalculateTeamConsistencyFromPredictionHistory(supabase, season, teams)

      if (!result.ok) {
        setConsistencyMessage(`Could not recalculate: ${result.error}`)
        return
      }

      setConsistencyMessage(
        'Consistency recalculated from prediction_history using the saved consistency model settings for this season (error divisor, trust floor, anchor thresholds).'
      )

      await trackEvent('admin_recalculate_consistency', 'admin', {
        season,
        source: 'prediction_history',
      })
      await loadUsageEvents()
    } finally {
      setRecalculatingConsistency(false)
    }
  }

  async function handleBackfillPredictionHistory(replaceExisting: boolean) {
    setBackfillMessage('')
    setBackfilling(true)
    try {
      const season = Number(backfillSeason)
      if (Number.isNaN(season)) {
        setBackfillMessage('Invalid season.')
        return
      }
      const result = await backfillPredictionHistoryForSeason(supabase, {
        season,
        teams,
        replaceExisting,
      })
      if (!result.ok) {
        setBackfillMessage(`Error: ${result.error}`)
        return
      }
      setBackfillMessage(
        `Backfill complete. Processed ${result.processed} matches. Inserted ${result.inserted}, skipped ${result.skipped}, no usable prediction ${result.noPrediction}. Replaced existing ${result.replaced}. Team consistency recalculated for season ${season}.`
      )
      await trackEvent('admin_backfill_prediction_history', 'admin', {
        season,
        processed: result.processed,
        inserted: result.inserted,
        skipped: result.skipped,
        noPrediction: result.noPrediction,
        replaced: result.replaced,
        replaceExisting,
      })
      await loadUsageEvents()
    } finally {
      setBackfilling(false)
    }
  }

  async function handleClearPredictionHistoryForSeason() {
    const season = Number(backfillSeason)
    if (Number.isNaN(season)) {
      setBackfillMessage('Invalid season.')
      return
    }
    const confirmed = window.confirm(
      `Delete all prediction_history rows for season ${season}? This cannot be undone.`
    )
    if (!confirmed) return

    setBackfillMessage('')
    setClearingHistory(true)
    try {
      const cleared = await clearPredictionHistoryForSeason(supabase, season)
      if (!cleared.ok) {
        setBackfillMessage(`Clear failed: ${cleared.error}`)
        return
      }
      const recalc = await recalculateTeamConsistencyFromPredictionHistory(supabase, season, teams)
      if (!recalc.ok) {
        setBackfillMessage(`History cleared. Consistency recalc failed: ${recalc.error}`)
        return
      }
      setBackfillMessage(
        `Cleared prediction_history for season ${season} and recalculated team_consistency.`
      )
      await trackEvent('admin_clear_prediction_history', 'admin', { season })
      await loadUsageEvents()
    } finally {
      setClearingHistory(false)
    }
  }

  function getTeamNameById(teamId: number) {
    return teams.find((team) => team.id === teamId)?.name || `Team ${teamId}`
  }

  function getTeamLogoById(teamId: number): string | undefined {
    const url = teams.find((team) => team.id === teamId)?.logo_url
    return url || undefined
  }

  function formatPvaFixtureLabel(row: PvaFixtureRow): string {
    const home = getTeamNameById(row.team_a_id)
    const away = getTeamNameById(row.team_b_id)
    return `${home} ${row.team_a_score} - ${row.team_b_score} ${away}`
  }

  /** Load prediction_history by match_id and sync pvaImageForm (fixture-picker flow). */
  async function applyPvaFixtureFromMatch(match: PvaFixtureRow) {
    const gen = ++pvaApplyFixtureGenRef.current
    setPvaLoading(true)
    setPvaAutoMessage('')
    try {
      const { data: ph, error } = await supabase
        .from('prediction_history')
        .select('predicted_margin, prediction_error')
        .eq('match_id', match.id)
        .maybeSingle()

      if (pvaApplyFixtureGenRef.current !== gen) return

      if (error) {
        setPvaAutoMessage(error.message)
        setPvaImageForm((prev) => ({
          ...prev,
          homeTeam: String(match.team_a_id),
          awayTeam: String(match.team_b_id),
          matchDate: match.match_date,
          actualHomeScore: String(match.team_a_score ?? ''),
          actualAwayScore: String(match.team_b_score ?? ''),
          predictedMargin: '',
          predictionError: null,
        }))
        return
      }

      const pm = ph?.predicted_margin
      const predStr =
        pm != null && pm !== '' && Number.isFinite(Number(pm)) ? String(pm) : ''

      setPvaImageForm((prev) => ({
        ...prev,
        homeTeam: String(match.team_a_id),
        awayTeam: String(match.team_b_id),
        matchDate: match.match_date,
        actualHomeScore: String(match.team_a_score ?? ''),
        actualAwayScore: String(match.team_b_score ?? ''),
        predictedMargin: predStr,
        predictionError:
          ph?.prediction_error != null && Number.isFinite(Number(ph.prediction_error))
            ? Number(ph.prediction_error)
            : null,
      }))

      if (!ph) {
        setPvaAutoMessage('No stored prediction found for this fixture.')
      } else {
        setPvaAutoMessage('')
      }
    } finally {
      if (pvaApplyFixtureGenRef.current === gen) setPvaLoading(false)
    }
  }

  /** Safe fragment for PNG filenames (Home vs Away). */
  function filenameSlugForExport(name: string) {
    return name
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'team'
  }

  const socialPrediction = useMemo(() => {
    if (!matchImageForm.homeTeam || !matchImageForm.awayTeam) {
      return {
        margin: null as number | null,
        headline: 'Select two teams',
        rationale: 'Choose Home Team and Away Team to generate a prediction image.',
      }
    }
    if (matchImageForm.homeTeam === matchImageForm.awayTeam) {
      return {
        margin: null as number | null,
        headline: 'Choose different teams',
        rationale: 'Home Team and Away Team cannot be the same.',
      }
    }

    const homeTeamId = Number(matchImageForm.homeTeam)
    const awayTeamId = Number(matchImageForm.awayTeam)
    const homeTeamName = getTeamNameById(homeTeamId)
    const awayTeamName = getTeamNameById(awayTeamId)

    const predictorMatches: PredictorMatch[] = matches.map((m) => ({
      id: m.id,
      season: m.season,
      match_date: m.match_date,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      team_a_score: m.team_a_score,
      team_b_score: m.team_b_score,
    }))

    const directMatch = predictorMatches.find(
      (m) =>
        (m.team_a_id === homeTeamId && m.team_b_id === awayTeamId) ||
        (m.team_a_id === awayTeamId && m.team_b_id === homeTeamId)
    )

    if (directMatch) {
      const margin =
        directMatch.team_a_id === homeTeamId
          ? directMatch.team_a_score - directMatch.team_b_score
          : directMatch.team_b_score - directMatch.team_a_score
      const rationale = `Direct result from played fixture · Season ${seasonFilter}`
      if (Math.round(margin) === 0) {
        return {
          margin,
          headline: `${homeTeamName} and ${awayTeamName} to draw`,
          rationale,
        }
      }
      const winner = margin > 0 ? homeTeamName : awayTeamName
      return {
        margin,
        headline: `${winner} by ${Math.round(Math.abs(margin))}`,
        rationale,
      }
    }

    const graph = buildGraph(predictorMatches)
    const volatilityConsistencyMap = calculateTeamConsistency(predictorMatches)
    const strengthMap = computeSeasonStrengthRatings(predictorMatches)
    const allPaths = findAllPathsWithWeights(
      graph,
      String(homeTeamId),
      String(awayTeamId),
      MAX_LINKS,
      teams,
      volatilityConsistencyMap,
      strengthMap,
      studioTeamConsistencyByTeamId,
      studioStrongOpponentBoostParams
    )

    if (allPaths.length === 0) {
      return {
        margin: null as number | null,
        headline: 'Prediction unavailable',
        rationale: 'Not enough linked data for an indirect prediction. Same logic as the public predictor.',
      }
    }

    const weightedTotal = allPaths.reduce((sum, p) => sum + p.totalMargin * p.weight, 0)
    const totalWeight = allPaths.reduce((sum, p) => sum + p.weight, 0)
    const margin = weightedTotal / totalWeight
    const confidence = getConfidence('indirect', allPaths.length, totalWeight)
    const rationale = `Indirect prediction · ${confidence} confidence · ${allPaths.length} linked path(s) · Season ${seasonFilter} (same model as /predictor).`

    if (Math.round(margin) === 0) {
      return {
        margin,
        headline: `${homeTeamName} and ${awayTeamName} to draw`,
        rationale,
      }
    }

    const winner = margin > 0 ? homeTeamName : awayTeamName
    return {
      margin,
      headline: `${winner} by ${Math.round(Math.abs(margin))}`,
      rationale,
    }
  }, [
    matchImageForm.homeTeam,
    matchImageForm.awayTeam,
    matches,
    teams,
    seasonFilter,
    studioTeamConsistencyByTeamId,
    studioStrongOpponentBoostParams,
  ])

  const poolsWithRankings = useMemo(() => {
    const filtered = matches.filter((m) => m.season === Number(seasonFilter))
    const adjacency = new Map<number, Set<number>>()

    for (const match of filtered) {
      if (!adjacency.has(match.team_a_id)) adjacency.set(match.team_a_id, new Set())
      if (!adjacency.has(match.team_b_id)) adjacency.set(match.team_b_id, new Set())
      adjacency.get(match.team_a_id)!.add(match.team_b_id)
      adjacency.get(match.team_b_id)!.add(match.team_a_id)
    }

    const visited = new Set<number>()
    const pools: number[][] = []

    for (const teamId of adjacency.keys()) {
      if (visited.has(teamId)) continue
      const stack = [teamId]
      const pool: number[] = []
      visited.add(teamId)

      while (stack.length > 0) {
        const current = stack.pop()!
        pool.push(current)
        for (const next of adjacency.get(current) || []) {
          if (!visited.has(next)) {
            visited.add(next)
            stack.push(next)
          }
        }
      }
      pools.push(pool)
    }

    return pools
      .map((poolTeamIds, index) => {
        const poolSet = new Set(poolTeamIds)
        const poolMatches = filtered.filter(
          (m) => poolSet.has(m.team_a_id) && poolSet.has(m.team_b_id)
        )

        const ratings: Record<number, number> = {}
        for (const id of poolTeamIds) ratings[id] = 0

        for (let i = 0; i < 800; i++) {
          for (const match of poolMatches) {
            const margin = match.team_a_score - match.team_b_score
            const predicted = ratings[match.team_a_id] - ratings[match.team_b_id]
            const error = predicted - margin
            ratings[match.team_a_id] -= 0.02 * error
            ratings[match.team_b_id] += 0.02 * error
          }

          const mean =
            poolTeamIds.reduce((sum, id) => sum + ratings[id], 0) / poolTeamIds.length
          for (const id of poolTeamIds) ratings[id] -= mean
        }

        const ranking = poolTeamIds
          .map((id) => ({ id, name: getTeamNameById(id), score: ratings[id] }))
          .sort((a, b) => b.score - a.score)

        return {
          poolId: index + 1,
          teamCount: poolTeamIds.length,
          ranking,
        }
      })
      .sort((a, b) => b.teamCount - a.teamCount)
  }, [matches, seasonFilter, teams])

  const selectedRankingPool = useMemo(() => {
    if (!poolsWithRankings.length) return null
    if (rankingsImageForm.pool === 'all') return poolsWithRankings[0]
    const poolId = Number(rankingsImageForm.pool)
    return poolsWithRankings.find((pool) => pool.poolId === poolId) || poolsWithRankings[0]
  }, [poolsWithRankings, rankingsImageForm.pool])

  const rankingListForImage = useMemo(() => {
    const pool = selectedRankingPool
    if (!pool) return []
    return pool.ranking.slice(0, rankingsImageForm.limit)
  }, [selectedRankingPool, rankingsImageForm.limit])

  /** Difference in points: prefer DB prediction_error when present, else |predicted margin − actual margin|. */
  const pvaDelta = useMemo(() => {
    if (pvaImageForm.predictionError != null && !Number.isNaN(pvaImageForm.predictionError)) {
      return pvaImageForm.predictionError
    }
    const predicted = Number(pvaImageForm.predictedMargin)
    const a = Number(pvaImageForm.actualHomeScore)
    const b = Number(pvaImageForm.actualAwayScore)
    if (Number.isNaN(predicted) || Number.isNaN(a) || Number.isNaN(b)) return null
    const actualMargin = a - b
    return Math.abs(predicted - actualMargin)
  }, [
    pvaImageForm.predictionError,
    pvaImageForm.predictedMargin,
    pvaImageForm.actualHomeScore,
    pvaImageForm.actualAwayScore,
  ])

  /** Load all matches for the selected calendar date (Played Fixture dropdown). */
  useEffect(() => {
    if (activeStudioTab !== 'pva') {
      setPvaFixtureLoading(false)
      return
    }

    const date = pvaImageForm.matchDate
    if (!date) {
      setPvaFixturesForDate([])
      setPvaFixtureMessage('')
      return
    }

    let cancelled = false
    setPvaFixturesForDate([])
    setPvaFixtureLoading(true)
    setPvaFixtureMessage('')

    void (async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, match_date, season, team_a_id, team_b_id, team_a_score, team_b_score')
        .eq('match_date', date)
        .order('id', { ascending: true })

      if (cancelled) return

      if (error) {
        setPvaFixtureMessage(error.message)
        setPvaFixturesForDate([])
        setPvaSelectedFixtureId('')
        if (!pvaManualTeamPick) {
          setPvaImageForm((prev) => ({
            ...prev,
            homeTeam: '',
            awayTeam: '',
            predictedMargin: '',
            actualHomeScore: '',
            actualAwayScore: '',
            predictionError: null,
          }))
        }
        setPvaFixtureLoading(false)
        return
      }

      const rows = (data || []) as PvaFixtureRow[]
      if (rows.length === 0) {
        setPvaFixtureMessage('No fixtures found for this date.')
        setPvaFixturesForDate([])
        setPvaSelectedFixtureId('')
        if (!pvaManualTeamPick) {
          setPvaImageForm((prev) => ({
            ...prev,
            homeTeam: '',
            awayTeam: '',
            predictedMargin: '',
            actualHomeScore: '',
            actualAwayScore: '',
            predictionError: null,
          }))
        }
      } else {
        setPvaFixturesForDate(rows)
        setPvaFixtureMessage('')
        setPvaSelectedFixtureId((prev) => {
          if (prev && !rows.some((m) => String(m.id) === prev)) {
            if (!pvaManualTeamPick) {
              setPvaImageForm((p) => ({
                ...p,
                homeTeam: '',
                awayTeam: '',
                predictedMargin: '',
                actualHomeScore: '',
                actualAwayScore: '',
                predictionError: null,
              }))
            }
            return ''
          }
          return prev
        })
      }
      setPvaFixtureLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [activeStudioTab, pvaImageForm.matchDate, pvaManualTeamPick])

  useEffect(() => {
    if (activeStudioTab !== 'pva') {
      setPvaLoading(false)
      return
    }
    if (pvaImageForm.manualOverride) return
    if (!pvaManualTeamPick) return

    const home = pvaImageForm.homeTeam
    const away = pvaImageForm.awayTeam
    const date = pvaImageForm.matchDate

    if (!home || !away || !date) {
      setPvaAutoMessage('')
      setPvaLoading(false)
      setPvaImageForm((prev) => ({
        ...prev,
        predictedMargin: '',
        actualHomeScore: '',
        actualAwayScore: '',
        predictionError: null,
      }))
      return
    }

    if (home === away) {
      setPvaAutoMessage('Choose different home and away teams.')
      setPvaLoading(false)
      setPvaImageForm((prev) => ({
        ...prev,
        predictedMargin: '',
        actualHomeScore: '',
        actualAwayScore: '',
        predictionError: null,
      }))
      return
    }

    const homeId = Number(home)
    const awayId = Number(away)

    const gen = ++pvaLoadGenRef.current

    void (async () => {
      setPvaLoading(true)
      setPvaAutoMessage('')

      try {
        const { data: matchRows, error: matchErr } = await supabase
          .from('matches')
          .select('id, team_a_score, team_b_score, season, match_date')
          .eq('match_date', date)
          .eq('team_a_id', homeId)
          .eq('team_b_id', awayId)
          .limit(1)

        if (pvaLoadGenRef.current !== gen) return

        if (matchErr) {
          setPvaAutoMessage(matchErr.message)
          setPvaImageForm((prev) => ({
            ...prev,
            predictedMargin: '',
            actualHomeScore: '',
            actualAwayScore: '',
            predictionError: null,
          }))
          return
        }

        const match = matchRows?.[0]
        if (!match) {
          setPvaAutoMessage('No result found for this fixture and date.')
          setPvaImageForm((prev) => ({
            ...prev,
            predictedMargin: '',
            actualHomeScore: '',
            actualAwayScore: '',
            predictionError: null,
          }))
          return
        }

        const actualHome = String(match.team_a_score ?? '')
        const actualAway = String(match.team_b_score ?? '')

        const { data: phByMatch, error: phErr1 } = await supabase
          .from('prediction_history')
          .select('predicted_margin, prediction_error')
          .eq('match_id', match.id)
          .maybeSingle()

        if (pvaLoadGenRef.current !== gen) return

        if (phErr1) {
          setPvaAutoMessage(phErr1.message)
          setPvaImageForm((prev) => ({
            ...prev,
            predictedMargin: '',
            actualHomeScore: actualHome,
            actualAwayScore: actualAway,
            predictionError: null,
          }))
          return
        }

        let ph = phByMatch
        if (!ph) {
          const { data: phRows, error: phErr2 } = await supabase
            .from('prediction_history')
            .select('predicted_margin, prediction_error')
            .eq('season', match.season)
            .eq('match_date', date)
            .eq('team_a_id', homeId)
            .eq('team_b_id', awayId)
            .limit(1)

          if (pvaLoadGenRef.current !== gen) return

          if (phErr2) {
            setPvaAutoMessage(phErr2.message)
            setPvaImageForm((prev) => ({
              ...prev,
              predictedMargin: '',
              actualHomeScore: actualHome,
              actualAwayScore: actualAway,
              predictionError: null,
            }))
            return
          }
          ph = phRows?.[0] ?? null
        }

        if (!ph) {
          setPvaAutoMessage('No stored prediction found for this fixture.')
          setPvaImageForm((prev) => ({
            ...prev,
            predictedMargin: '',
            actualHomeScore: actualHome,
            actualAwayScore: actualAway,
            predictionError: null,
          }))
          return
        }

        const pm = ph.predicted_margin
        const predStr =
          pm != null && pm !== '' && Number.isFinite(Number(pm)) ? String(pm) : ''

        setPvaAutoMessage('')
        setPvaImageForm((prev) => ({
          ...prev,
          predictedMargin: predStr,
          actualHomeScore: actualHome,
          actualAwayScore: actualAway,
          predictionError:
            ph.prediction_error != null && Number.isFinite(Number(ph.prediction_error))
              ? Number(ph.prediction_error)
              : null,
        }))
      } finally {
        if (pvaLoadGenRef.current === gen) setPvaLoading(false)
      }
    })()
  }, [
    activeStudioTab,
    pvaManualTeamPick,
    pvaImageForm.manualOverride,
    pvaImageForm.homeTeam,
    pvaImageForm.awayTeam,
    pvaImageForm.matchDate,
  ])

  async function downloadCardAsPng(ref: HTMLDivElement | null, filename: string) {
    const result = await downloadPngFromElement(ref, filename)
    if (result.ok) {
      setStudioMessage('Image downloaded.')
    } else {
      setStudioMessage(result.error)
    }
  }

  const teamOptions = useMemo(() => teams, [teams])

  const duplicateGameGroups = useMemo(() => {
    const grouped = new Map<string, MatchRow[]>()

    for (const match of matches) {
      const teamIds = [match.team_a_id, match.team_b_id].sort((a, b) => a - b)
      const scores = [match.team_a_score, match.team_b_score].sort((a, b) => a - b)
      const key = `${match.match_date}|${teamIds[0]}-${teamIds[1]}|${scores[0]}-${scores[1]}`

      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(match)
    }

    return Array.from(grouped.values())
      .filter((group) => group.length > 1)
      .map((group) => {
        const first = group[0]
        const teamAName = getTeamNameById(first.team_a_id)
        const teamBName = getTeamNameById(first.team_b_id)
        const sortedScores = [first.team_a_score, first.team_b_score].sort((a, b) => a - b)

        return {
          date: first.match_date,
          teamAName,
          teamBName,
          scorePair: `${sortedScores[0]}-${sortedScores[1]}`,
          rows: group,
        }
      })
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      )
  }, [matches, teams])

  const usageSummary = useMemo(() => {
    const totalEvents = usageEvents.length
    const pageViews = usageEvents.filter((e) => e.event_type === 'page_view').length
    const predictions = usageEvents.filter((e) => e.event_type === 'prediction_run').length
    const adminActions = usageEvents.filter((e) => e.page === 'admin').length

    return {
      totalEvents,
      pageViews,
      predictions,
      adminActions,
    }
  }, [usageEvents])

  function formatDetails(details: Record<string, any> | null) {
    if (!details || Object.keys(details).length === 0) return '-'
    const text = JSON.stringify(details)
    return text.length > 120 ? `${text.slice(0, 120)}...` : text
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin</h1>
            <p className="mt-2 text-gray-600">Logged in as {adminEmail}</p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Log out
          </button>
        </div>

        <p className="mt-4 text-gray-600">
          Add schools, add results, bulk Excel or URL import, upload team logos, view results,
          delete incorrect scores, recalculate team consistency, and monitor usage.
        </p>

        <section className="mt-10" aria-labelledby="admin-tools-heading">
          <h2 id="admin-tools-heading" className="text-lg font-semibold text-gray-900">
            Internal tools
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Analysis and data tools (admin accounts only). Use the bar above to switch quickly.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ADMIN_TOOL_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-gray-50/80 p-5 shadow-sm transition hover:border-gray-300 hover:bg-white hover:shadow-md"
              >
                <span className="text-base font-semibold text-gray-900 group-hover:text-red-800">
                  {card.title}
                </span>
                <span className="mt-2 flex-1 text-sm text-gray-600">{card.description}</span>
                <span className="mt-4 text-xs font-semibold text-red-700">Open →</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            onClick={() => setActiveAdminTab('add-delete')}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              activeAdminTab === 'add-delete'
                ? 'bg-black text-white'
                : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
            }`}
          >
            Add & Delete
          </button>

          <button
            onClick={() => setActiveAdminTab('usage')}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              activeAdminTab === 'usage'
                ? 'bg-black text-white'
                : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
            }`}
          >
            Usage Dashboard
          </button>

          <button
            onClick={() => setActiveAdminTab('scores')}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              activeAdminTab === 'scores'
                ? 'bg-black text-white'
                : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
            }`}
          >
            Scores
          </button>

          <button
            onClick={() => setActiveAdminTab('social')}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              activeAdminTab === 'social'
                ? 'bg-black text-white'
                : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
            }`}
          >
            Social Image Studio
          </button>
        </div>

        {activeAdminTab === 'add-delete' && (
          <>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setActiveAddDeleteTab('school')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeAddDeleteTab === 'school'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Add School
              </button>

              <button
                onClick={() => setActiveAddDeleteTab('match')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeAddDeleteTab === 'match'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Add Match Results
              </button>

              <button
                onClick={() => setActiveAddDeleteTab('bulk')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeAddDeleteTab === 'bulk'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Bulk Uploads
              </button>

              <button
                onClick={() => setActiveAddDeleteTab('logo')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeAddDeleteTab === 'logo'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Add Team Logo
              </button>

              <button
                onClick={() => setActiveAddDeleteTab('delete-team')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeAddDeleteTab === 'delete-team'
                    ? 'bg-red-600 text-white'
                    : 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
                }`}
              >
                Delete Team
              </button>
            </div>

            {activeAddDeleteTab === 'school' && (
              <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Add School</h2>

                <form onSubmit={handleAddSchool} className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">School name</label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      placeholder="Enter school name"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-fit rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
                  >
                    Add school
                  </button>
                </form>

                {schoolMessage && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                    {schoolMessage}
                  </div>
                )}
              </section>
            )}

            {activeAddDeleteTab === 'match' && (
              <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Add Match Result</h2>

                <form onSubmit={handleAddMatch} className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Match date</label>
                    <input
                      type="date"
                      value={form.match_date}
                      onChange={(e) =>
                        setForm({ ...form, match_date: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Team A</label>
                    <select
                      value={form.team_a_id}
                      onChange={(e) =>
                        setForm({ ...form, team_a_id: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      disabled={loadingTeams}
                    >
                      <option value="">Choose Team A</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Team B</label>
                    <select
                      value={form.team_b_id}
                      onChange={(e) =>
                        setForm({ ...form, team_b_id: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      disabled={loadingTeams}
                    >
                      <option value="">Choose Team B</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Team A score</label>
                    <input
                      type="number"
                      min="0"
                      value={form.team_a_score}
                      onChange={(e) =>
                        setForm({ ...form, team_a_score: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Team B score</label>
                    <input
                      type="number"
                      min="0"
                      value={form.team_b_score}
                      onChange={(e) =>
                        setForm({ ...form, team_b_score: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-fit rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
                  >
                    Save result
                  </button>
                </form>

                {matchMessage && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                    {matchMessage}
                  </div>
                )}
              </section>
            )}

            {activeAddDeleteTab === 'bulk' && (
              <>
              <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Bulk Upload Weekly Scores</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Upload an Excel file with columns: match_date, team_a, team_b, team_a_score, team_b_score
                </p>

                <div className="mt-4 flex flex-col gap-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="block w-full rounded-xl border border-gray-300 px-4 py-3"
                  />

                  {uploadRows.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-gray-200">
                      <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-left">Team A</th>
                            <th className="p-3 text-left">Score</th>
                            <th className="p-3 text-left">Team B</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadRows.slice(0, 20).map((row, index) => (
                            <tr key={index} className="border-t">
                              <td className="p-3">{row.match_date}</td>
                              <td className="p-3">{row.team_a}</td>
                              <td className="p-3 font-semibold">
                                {row.team_a_score} - {row.team_b_score}
                              </td>
                              <td className="p-3">{row.team_b}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {uploadRows.length > 20 && (
                    <p className="text-sm text-gray-500">
                      Preview showing first 20 rows of {uploadRows.length} loaded rows.
                    </p>
                  )}

                  <button
                    onClick={handleImportRows}
                    disabled={!uploadRows.length || uploading}
                    className="w-fit rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {uploading ? 'Importing...' : 'Import weekly scores'}
                  </button>
                </div>

                {uploadMessage && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                    {uploadMessage}
                  </div>
                )}
              </section>

              <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Import Scores from URL</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Paste a page that lists fixtures (e.g. schoolboyrugby results). Rows are parsed as{' '}
                  <code className="text-xs">Team A 24-17 Team B</code> (also supports en-dash and vs). Review
                  team matching before importing — each insert uses the full prediction snapshot flow.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  <label className="text-sm font-medium">Results URL</label>
                  <input
                    type="url"
                    value={resultsUrl}
                    onChange={(e) => setResultsUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  />
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        Default match date (if the page has no date)
                      </label>
                      <input
                        type="date"
                        value={urlFallbackDate}
                        onChange={(e) => setUrlFallbackDate(e.target.value)}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleParseResultsUrl}
                      disabled={urlImportParsing || !teams.length}
                      className="rounded-xl bg-black px-5 py-3 text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {urlImportParsing ? 'Parsing…' : 'Parse results'}
                    </button>
                  </div>
                </div>

                {urlParseNotes.length > 0 && (
                  <ul className="mt-3 list-inside list-disc text-xs text-gray-600">
                    {urlParseNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}

                {urlImportRows.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="min-w-full bg-white text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Home (parsed)</th>
                          <th className="p-2 text-left">Score</th>
                          <th className="p-2 text-left">Away (parsed)</th>
                          <th className="p-2 text-left">Home → DB</th>
                          <th className="p-2 text-left">Away → DB</th>
                          <th className="p-2 text-left">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {urlImportRows.map((row) => {
                          const needs =
                            !row.removed && (!row.team_a_id || !row.team_b_id)
                          return (
                            <tr
                              key={row.key}
                              className={`border-t ${needs ? 'bg-amber-50' : ''} ${row.removed ? 'opacity-40' : ''}`}
                            >
                              <td className="p-2 align-top">
                                <input
                                  type="date"
                                  value={row.match_date}
                                  disabled={row.removed}
                                  onChange={(e) =>
                                    setUrlImportRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, match_date: e.target.value } : r
                                      )
                                    )
                                  }
                                  className="w-[10.5rem] rounded border border-gray-200 px-1 py-1"
                                />
                              </td>
                              <td className="p-2 align-top">{row.team_a_name}</td>
                              <td className="p-2 align-top font-semibold">
                                {row.team_a_score} - {row.team_b_score}
                              </td>
                              <td className="p-2 align-top">{row.team_b_name}</td>
                              <td className="p-2 align-top">
                                <select
                                  value={row.team_a_id ?? ''}
                                  disabled={row.removed}
                                  onChange={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null
                                    setUrlImportRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key
                                          ? {
                                              ...r,
                                              team_a_id: v,
                                              team_a_label: v ? 'manual' : 'unmatched',
                                            }
                                          : r
                                      )
                                    )
                                  }}
                                  className="max-w-[11rem] rounded border border-gray-300 px-1 py-1 text-xs"
                                >
                                  <option value="">— Select —</option>
                                  {teamOptions.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-[10px] text-gray-500">{row.team_a_label}</p>
                              </td>
                              <td className="p-2 align-top">
                                <select
                                  value={row.team_b_id ?? ''}
                                  disabled={row.removed}
                                  onChange={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null
                                    setUrlImportRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key
                                          ? {
                                              ...r,
                                              team_b_id: v,
                                              team_b_label: v ? 'manual' : 'unmatched',
                                            }
                                          : r
                                      )
                                    )
                                  }}
                                  className="max-w-[11rem] rounded border border-gray-300 px-1 py-1 text-xs"
                                >
                                  <option value="">— Select —</option>
                                  {teamOptions.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-[10px] text-gray-500">{row.team_b_label}</p>
                              </td>
                              <td className="p-2 align-top">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setUrlImportRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, removed: !r.removed } : r
                                      )
                                    )
                                  }
                                  className="text-xs text-red-700 underline"
                                >
                                  {row.removed ? 'Undo' : 'Remove'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleImportApprovedUrlScores}
                    disabled={
                      urlImporting ||
                      !urlImportRows.some((r) => !r.removed && r.team_a_id && r.team_b_id)
                    }
                    className="rounded-xl bg-black px-5 py-3 text-sm text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {urlImporting ? 'Importing…' : 'Import approved scores'}
                  </button>
                  {urlImportRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setUrlImportRows((prev) =>
                          prev.map((r) => ({ ...r, match_date: urlFallbackDate }))
                        )
                      }}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
                    >
                      Apply default date to all rows
                    </button>
                  )}
                </div>

                {urlImportMessage && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                    {urlImportMessage}
                  </div>
                )}
              </section>
              </>
            )}

            {activeAddDeleteTab === 'logo' && (
              <div className="mt-6">
                <TeamLogoUploader />
              </div>
            )}

            {activeAddDeleteTab === 'delete-team' && (
              <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-red-900">Delete Team</h2>
                <p className="mt-2 text-sm text-red-800">
                  This is a permanent action. This will remove team and all linked matches.
                </p>

                <div className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-red-900">Team</label>
                    <select
                      value={teamToDeleteId}
                      onChange={(e) => setTeamToDeleteId(e.target.value)}
                      className="w-full rounded-xl border border-red-300 bg-white px-4 py-3"
                      disabled={loadingTeams}
                    >
                      <option value="">Choose team to delete</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleDeleteTeam}
                    className="w-fit rounded-xl bg-red-600 px-5 py-3 text-white hover:bg-red-700"
                  >
                    Delete team and linked data
                  </button>
                </div>

                {teamDeleteMessage && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-900">
                    {teamDeleteMessage}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {activeAdminTab === 'usage' && (
          <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Usage Dashboard</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Track page views, predictions, and admin activity.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={loadUsageEvents}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Refresh usage
                </button>

                <button
                  onClick={() => setShowRecentActivity((prev) => !prev)}
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  {showRecentActivity ? 'Hide recent activity' : 'Show recent activity'}
                </button>
              </div>
            </div>

            {usageMessage && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                {usageMessage}
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm text-gray-500">Total Events</div>
                <div className="mt-2 text-3xl font-bold">{usageSummary.totalEvents}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm text-gray-500">Page Views</div>
                <div className="mt-2 text-3xl font-bold">{usageSummary.pageViews}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm text-gray-500">Predictions Run</div>
                <div className="mt-2 text-3xl font-bold">{usageSummary.predictions}</div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm text-gray-500">Admin Actions</div>
                <div className="mt-2 text-3xl font-bold">{usageSummary.adminActions}</div>
              </div>
            </div>

            {showRecentActivity && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold">Recent Activity</h3>

                {loadingUsage ? (
                  <p className="mt-4">Loading usage events...</p>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="min-w-full bg-white">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-3 text-left">Date</th>
                          <th className="p-3 text-left">Event</th>
                          <th className="p-3 text-left">Page</th>
                          <th className="p-3 text-left">User</th>
                          <th className="p-3 text-left">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageEvents.map((event) => (
                          <tr key={event.id} className="border-t align-top">
                            <td className="p-3 text-sm">
                              {new Date(event.created_at).toLocaleString()}
                            </td>
                            <td className="p-3 text-sm font-medium">{event.event_type}</td>
                            <td className="p-3 text-sm">{event.page || '-'}</td>
                            <td className="p-3 text-sm">{event.user_email || '-'}</td>
                            <td className="p-3 text-xs text-gray-600">
                              {formatDetails(event.details)}
                            </td>
                          </tr>
                        ))}

                        {usageEvents.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-sm text-gray-500">
                              No usage events found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeAdminTab === 'scores' && (
          <>
            <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Consistency model settings</h2>
              <p className="mt-2 text-sm text-gray-600">
                Tune how prediction error maps to scores, anchor tiers, and strong-opponent path boost. Values are stored per
                season in <code className="text-xs">consistency_model_settings</code>. If no row exists, defaults apply. Use the
                same season as &quot;Scores Added&quot; below.
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Current season: <strong>{seasonFilter}</strong>
                {consistencyModelUpdatedAt && (
                  <>
                    {' '}
                    · Last saved: {new Date(consistencyModelUpdatedAt).toLocaleString()}
                  </>
                )}
                {consistencyModelLoading && ' · Loading…'}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">error_divisor</span>
                  <input
                    type="number"
                    step="any"
                    min={1}
                    value={consistencyModelForm.error_divisor}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        error_divisor: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                  <span className="text-xs text-gray-500">consistency_score = max(0, 1 − avg_error / divisor)</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">min_trust_floor</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1}
                    value={consistencyModelForm.min_trust_floor}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        min_trust_floor: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                  <span className="text-xs text-gray-500">Applied when matches_evaluated &gt; 0</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">trusted_anchor_min_matches</span>
                  <input
                    type="number"
                    min={1}
                    value={consistencyModelForm.trusted_anchor_min_matches}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        trusted_anchor_min_matches: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">trusted_anchor_min_adjusted_consistency</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1}
                    value={consistencyModelForm.trusted_anchor_min_adjusted_consistency}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        trusted_anchor_min_adjusted_consistency: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">usable_reference_min_matches</span>
                  <input
                    type="number"
                    min={1}
                    value={consistencyModelForm.usable_reference_min_matches}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        usable_reference_min_matches: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">usable_reference_min_adjusted_consistency</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1}
                    value={consistencyModelForm.usable_reference_min_adjusted_consistency}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        usable_reference_min_adjusted_consistency: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">unstable_min_matches</span>
                  <input
                    type="number"
                    min={1}
                    value={consistencyModelForm.unstable_min_matches}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        unstable_min_matches: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">strong_opponent_step</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={consistencyModelForm.strong_opponent_step}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        strong_opponent_step: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                  <span className="text-xs text-gray-500">boost = 1 + min(max_count, strong_count) × step</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">max_strong_opponent_count</span>
                  <input
                    type="number"
                    min={0}
                    value={consistencyModelForm.max_strong_opponent_count}
                    onChange={(e) =>
                      setConsistencyModelForm((f) => ({
                        ...f,
                        max_strong_opponent_count: Number(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-gray-300 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveConsistencyModelSettings}
                  disabled={savingConsistencyModel || consistencyModelLoading}
                  className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
                >
                  {savingConsistencyModel ? 'Saving…' : 'Save settings'}
                </button>
                <button
                  type="button"
                  onClick={handleRecalculateConsistency}
                  disabled={recalculatingConsistency}
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 hover:bg-gray-50 disabled:opacity-50"
                >
                  {recalculatingConsistency ? 'Recalculating…' : 'Recalculate consistency'}
                </button>
              </div>

              {consistencyModelMessage && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                  {consistencyModelMessage}
                </div>
              )}

              {consistencyMessage && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                  {consistencyMessage}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Backfill prediction history</h2>
              <p className="mt-2 text-sm text-gray-600">
                One-time utility: for each match, simulates the model using only results from <strong>strictly earlier</strong>{' '}
                match dates (same-day fixtures are excluded from the prior set). Inserts <code className="text-xs">prediction_history</code>{' '}
                with <code className="text-xs">match_id</code>, then recalculates team consistency. Skip leaves existing rows;
                replace deletes and re-inserts per match.
              </p>

              <div className="mt-4 flex max-w-xs flex-col gap-2">
                <label className="text-sm font-medium">Season</label>
                <input
                  type="number"
                  value={backfillSeason}
                  onChange={(e) => setBackfillSeason(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleBackfillPredictionHistory(false)}
                  disabled={backfilling || clearingHistory || teams.length === 0}
                  className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
                >
                  {backfilling ? 'Running…' : 'Backfill prediction history'}
                </button>
                <button
                  type="button"
                  onClick={() => handleBackfillPredictionHistory(true)}
                  disabled={backfilling || clearingHistory || teams.length === 0}
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 hover:bg-gray-50 disabled:opacity-50"
                >
                  {backfilling ? 'Running…' : 'Backfill (replace existing)'}
                </button>
                <button
                  type="button"
                  onClick={handleClearPredictionHistoryForSeason}
                  disabled={backfilling || clearingHistory}
                  className="rounded-xl border border-red-300 bg-white px-5 py-3 text-red-800 hover:bg-red-50 disabled:opacity-50"
                >
                  {clearingHistory ? 'Clearing…' : 'Clear season history first'}
                </button>
              </div>

              {backfillMessage && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                  {backfillMessage}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Scores Added</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    View and delete scores for the selected season.
                  </p>
                </div>

                <div className="w-full max-w-xs">
                  <label className="mb-2 block text-sm font-medium">Season</label>
                  <input
                    type="number"
                    value={seasonFilter}
                    onChange={(e) => setSeasonFilter(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3"
                  />
                </div>
              </div>

              {deleteMessage && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                  {deleteMessage}
                </div>
              )}

              {loadingMatches ? (
                <p className="mt-6">Loading scores...</p>
              ) : (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-3 text-left">Date</th>
                        <th className="p-3 text-left">Team A</th>
                        <th className="p-3 text-left">Score</th>
                        <th className="p-3 text-left">Team B</th>
                        <th className="p-3 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((match) => (
                        <tr key={match.id} className="border-t">
                          <td className="p-3">
                            {new Date(match.match_date).toLocaleDateString()}
                          </td>
                          <td className="p-3">{match.team_a_name}</td>
                          <td className="p-3 font-semibold">
                            {match.team_a_score} - {match.team_b_score}
                          </td>
                          <td className="p-3">{match.team_b_name}</td>
                          <td className="p-3">
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}

                      {matches.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-sm text-gray-500">
                            No scores found for this season.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Duplicate Games Search</h2>
              <p className="mt-2 text-sm text-gray-600">
                Detect duplicate fixtures even when teams or scores were entered in reverse.
              </p>

              {loadingMatches ? (
                <p className="mt-6">Scanning matches...</p>
              ) : duplicateGameGroups.length === 0 ? (
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  No duplicate game groups found for this season.
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  {duplicateGameGroups.map((group, index) => (
                    <div key={`${group.date}-${index}`} className="rounded-2xl border border-gray-200">
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {new Date(group.date).toLocaleDateString()} | {group.teamAName} vs {group.teamBName} | Score pair {group.scorePair}
                        </div>
                        <div className="text-xs text-gray-500">
                          {group.rows.length} duplicate row(s) found
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="p-3 text-left">Date</th>
                              <th className="p-3 text-left">Team A</th>
                              <th className="p-3 text-left">Score</th>
                              <th className="p-3 text-left">Team B</th>
                              <th className="p-3 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((match) => (
                              <tr key={match.id} className="border-t">
                                <td className="p-3">
                                  {new Date(match.match_date).toLocaleDateString()}
                                </td>
                                <td className="p-3">{match.team_a_name}</td>
                                <td className="p-3 font-semibold">
                                  {match.team_a_score} - {match.team_b_score}
                                </td>
                                <td className="p-3">{match.team_b_name}</td>
                                <td className="p-3">
                                  <button
                                    onClick={() => handleDeleteMatch(match.id)}
                                    className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeAdminTab === 'social' && (
          <section className="mt-6 rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Social Image Studio</h2>
              <p className="text-sm text-gray-600">
                Build clean social cards for Facebook and Instagram from your current analytics data.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => setActiveStudioTab('match')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeStudioTab === 'match'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Match Prediction
              </button>
              <button
                onClick={() => setActiveStudioTab('rankings')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeStudioTab === 'rankings'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Top 10 Rankings
              </button>
              <button
                onClick={() => setActiveStudioTab('pva')}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  activeStudioTab === 'pva'
                    ? 'bg-black text-white'
                    : 'border border-gray-300 bg-white text-black hover:bg-gray-50'
                }`}
              >
                Predicted vs Actual
              </button>
            </div>

            {studioMessage && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                {studioMessage}
              </div>
            )}

            {activeStudioTab === 'match' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Match Prediction Image</h3>
                  <p className="text-xs text-gray-500">
                    Same order as the public predictor: Home Team is treated as team A in the model (positive
                    margin = home ahead).
                  </p>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Home Team</label>
                    <select
                      value={matchImageForm.homeTeam}
                      onChange={(e) => setMatchImageForm((prev) => ({ ...prev, homeTeam: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="">Choose home team</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Away Team</label>
                    <select
                      value={matchImageForm.awayTeam}
                      onChange={(e) => setMatchImageForm((prev) => ({ ...prev, awayTeam: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="">Choose away team</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Match Date</label>
                    <input
                      type="date"
                      value={matchImageForm.matchDate}
                      onChange={(e) =>
                        setMatchImageForm((prev) => ({ ...prev, matchDate: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Rationale</label>
                    <textarea
                      value={matchImageForm.rationale}
                      onChange={(e) =>
                        setMatchImageForm((prev) => ({ ...prev, rationale: e.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Format</label>
                    <select
                      value={matchImageForm.format}
                      onChange={(e) =>
                        setMatchImageForm((prev) => ({
                          ...prev,
                          format: e.target.value as SocialFormat,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="square">Facebook Square (1080x1080)</option>
                      <option value="portrait">Instagram Portrait (1080x1350)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Live Preview</h3>
                  <div className="mx-auto flex items-center justify-center">
                    <PredictionCard
                      ref={matchCardRef}
                      format={matchImageForm.format}
                      homeTeamName={
                        matchImageForm.homeTeam ? getTeamNameById(Number(matchImageForm.homeTeam)) : ''
                      }
                      awayTeamName={
                        matchImageForm.awayTeam ? getTeamNameById(Number(matchImageForm.awayTeam)) : ''
                      }
                      predictionMargin={socialPrediction.margin}
                      date={matchImageForm.matchDate || new Date().toISOString().slice(0, 10)}
                      rationale={matchImageForm.rationale || socialPrediction.rationale}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const homeN =
                        matchImageForm.homeTeam ? getTeamNameById(Number(matchImageForm.homeTeam)) : 'home'
                      const awayN =
                        matchImageForm.awayTeam ? getTeamNameById(Number(matchImageForm.awayTeam)) : 'away'
                      const datePart = matchImageForm.matchDate || String(Date.now())
                      downloadCardAsPng(
                        matchCardRef.current,
                        `match-prediction-${datePart}-${filenameSlugForExport(homeN)}-vs-${filenameSlugForExport(awayN)}.png`
                      )
                    }}
                    className="rounded-xl bg-black px-5 py-3 text-sm text-white hover:opacity-90"
                  >
                    Download PNG
                  </button>
                </div>
              </div>
            )}

            {activeStudioTab === 'rankings' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Top Rankings Image</h3>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Season</label>
                    <input
                      type="number"
                      value={seasonFilter}
                      onChange={(e) => setSeasonFilter(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Pool</label>
                    <select
                      value={rankingsImageForm.pool}
                      onChange={(e) =>
                        setRankingsImageForm((prev) => ({ ...prev, pool: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="all">Primary pool</option>
                      {poolsWithRankings.map((pool) => (
                        <option key={pool.poolId} value={String(pool.poolId)}>
                          Pool {pool.poolId} ({pool.teamCount} teams)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Show</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setRankingsImageForm((prev) => ({ ...prev, limit: 5 }))
                        }
                        className={`rounded-xl px-4 py-2 text-sm font-medium ${
                          rankingsImageForm.limit === 5
                            ? 'bg-black text-white'
                            : 'border border-gray-300 bg-white hover:bg-gray-50'
                        }`}
                      >
                        Top 5
                      </button>
                      <button
                        onClick={() =>
                          setRankingsImageForm((prev) => ({ ...prev, limit: 10 }))
                        }
                        className={`rounded-xl px-4 py-2 text-sm font-medium ${
                          rankingsImageForm.limit === 10
                            ? 'bg-black text-white'
                            : 'border border-gray-300 bg-white hover:bg-gray-50'
                        }`}
                      >
                        Top 10
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Format</label>
                    <select
                      value={rankingsImageForm.format}
                      onChange={(e) =>
                        setRankingsImageForm((prev) => ({
                          ...prev,
                          format: e.target.value as SocialFormat,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="square">Facebook Square (1080x1080)</option>
                      <option value="portrait">Instagram Portrait (1080x1350)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Live Preview</h3>
                  <div className="mx-auto flex items-center justify-center">
                    <ExportPredictionCard
                      ref={rankingsCardRef}
                      variant="rankings"
                      date={new Date().toLocaleDateString()}
                      rankings={rankingListForImage.map((t) => ({ id: t.id, name: t.name }))}
                      format={rankingsImageForm.format}
                    />
                  </div>
                  <button
                    onClick={() =>
                      downloadCardAsPng(
                        rankingsCardRef.current,
                        `network-rankings-${seasonFilter}.png`
                      )
                    }
                    className="rounded-xl bg-black px-5 py-3 text-sm text-white hover:opacity-90"
                  >
                    Download PNG
                  </button>
                </div>
              </div>
            )}

            {activeStudioTab === 'pva' && (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Predicted vs Actual Image</h3>
                  <p className="text-xs text-gray-500">
                    Default: pick a <strong className="font-medium">match date</strong>, then a{' '}
                    <strong className="font-medium">played fixture</strong> — team A (home) is on the left,
                    team B (away) on the right. Scores and stored predictions load from the database.
                  </p>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Match Date</label>
                    <input
                      type="date"
                      value={pvaImageForm.matchDate}
                      onChange={(e) => {
                        const next = e.target.value
                        setPvaSelectedFixtureId('')
                        if (!pvaManualTeamPick) {
                          setPvaImageForm((prev) => ({
                            ...prev,
                            matchDate: next,
                            homeTeam: '',
                            awayTeam: '',
                            predictedMargin: '',
                            actualHomeScore: '',
                            actualAwayScore: '',
                            predictionError: null,
                          }))
                        } else {
                          setPvaImageForm((prev) => ({ ...prev, matchDate: next }))
                        }
                      }}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Played Fixture</label>
                    <select
                      value={pvaSelectedFixtureId}
                      disabled={
                        pvaFixtureLoading || pvaManualTeamPick || pvaFixturesForDate.length === 0
                      }
                      onChange={async (e) => {
                        const v = e.target.value
                        setPvaSelectedFixtureId(v)
                        setPvaManualTeamPick(false)
                        if (!v) {
                          setPvaImageForm((prev) => ({
                            ...prev,
                            homeTeam: '',
                            awayTeam: '',
                            predictedMargin: '',
                            actualHomeScore: '',
                            actualAwayScore: '',
                            predictionError: null,
                          }))
                          setPvaAutoMessage('')
                          return
                        }
                        const row = pvaFixturesForDate.find((m) => String(m.id) === v)
                        if (row) await applyPvaFixtureFromMatch(row)
                      }}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                      <option value="">
                        {pvaFixtureLoading ? 'Loading fixtures…' : 'Choose a played fixture'}
                      </option>
                      {pvaFixturesForDate.map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatPvaFixtureLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {pvaFixtureLoading && (
                    <p className="text-sm text-gray-500" aria-live="polite">
                      Loading fixtures for this date…
                    </p>
                  )}
                  {pvaFixtureMessage && (
                    <p
                      className={`rounded-xl px-3 py-2 text-sm ${
                        pvaFixtureMessage.includes('No fixtures') ? 'bg-amber-50 text-amber-900' : 'bg-gray-100 text-gray-800'
                      }`}
                      role="status"
                    >
                      {pvaFixtureMessage}
                    </p>
                  )}

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={pvaManualTeamPick}
                      onChange={(e) => {
                        const on = e.target.checked
                        setPvaManualTeamPick(on)
                        if (on) {
                          setPvaSelectedFixtureId('')
                          setPvaAutoMessage('')
                          setPvaImageForm((prev) => ({
                            ...prev,
                            homeTeam: '',
                            awayTeam: '',
                            predictedMargin: '',
                            actualHomeScore: '',
                            actualAwayScore: '',
                            predictionError: null,
                          }))
                        }
                      }}
                    />
                    Pick home &amp; away manually (advanced)
                  </label>

                  <div>
                    <label className="mb-2 block text-sm font-medium">Home Team</label>
                    <select
                      value={pvaImageForm.homeTeam}
                      disabled={!pvaManualTeamPick}
                      onChange={(e) => setPvaImageForm((prev) => ({ ...prev, homeTeam: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                      <option value="">Choose home team</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Away Team</label>
                    <select
                      value={pvaImageForm.awayTeam}
                      disabled={!pvaManualTeamPick}
                      onChange={(e) => setPvaImageForm((prev) => ({ ...prev, awayTeam: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 disabled:cursor-not-allowed disabled:bg-gray-100"
                    >
                      <option value="">Choose away team</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={pvaImageForm.manualOverride}
                      onChange={(e) => {
                        const on = e.target.checked
                        setPvaImageForm((prev) => ({ ...prev, manualOverride: on }))
                        if (on) setPvaLoading(false)
                      }}
                    />
                    Manual override (debug)
                  </label>

                  {pvaLoading && (
                    <p className="text-sm text-gray-500" aria-live="polite">
                      Loading match and prediction…
                    </p>
                  )}
                  {pvaAutoMessage && (
                    <p
                      className={`rounded-xl px-3 py-2 text-sm ${
                        pvaAutoMessage.startsWith('No result') ||
                        pvaAutoMessage.startsWith('No stored prediction')
                          ? 'bg-amber-50 text-amber-900'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                      role="status"
                    >
                      {pvaAutoMessage}
                    </p>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Predicted margin {pvaImageForm.manualOverride ? '' : '(from prediction_history)'}
                    </label>
                    {pvaImageForm.manualOverride ? (
                      <input
                        type="number"
                        value={pvaImageForm.predictedMargin}
                        onChange={(e) =>
                          setPvaImageForm((prev) => ({
                            ...prev,
                            predictedMargin: e.target.value,
                            predictionError: null,
                          }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        placeholder="Positive = home by, negative = away by"
                      />
                    ) : (
                      <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 tabular-nums">
                        {pvaImageForm.predictedMargin === '' ? '—' : pvaImageForm.predictedMargin}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Actual home score {pvaImageForm.manualOverride ? '' : '(team A)'}
                      </label>
                      {pvaImageForm.manualOverride ? (
                        <input
                          type="number"
                          value={pvaImageForm.actualHomeScore}
                          onChange={(e) =>
                            setPvaImageForm((prev) => ({
                              ...prev,
                              actualHomeScore: e.target.value,
                              predictionError: null,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        />
                      ) : (
                        <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 tabular-nums">
                          {pvaImageForm.actualHomeScore === '' ? '—' : pvaImageForm.actualHomeScore}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">
                        Actual away score {pvaImageForm.manualOverride ? '' : '(team B)'}
                      </label>
                      {pvaImageForm.manualOverride ? (
                        <input
                          type="number"
                          value={pvaImageForm.actualAwayScore}
                          onChange={(e) =>
                            setPvaImageForm((prev) => ({
                              ...prev,
                              actualAwayScore: e.target.value,
                              predictionError: null,
                            }))
                          }
                          className="w-full rounded-xl border border-gray-300 px-4 py-3"
                        />
                      ) : (
                        <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800 tabular-nums">
                          {pvaImageForm.actualAwayScore === '' ? '—' : pvaImageForm.actualAwayScore}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Format</label>
                    <select
                      value={pvaImageForm.format}
                      onChange={(e) =>
                        setPvaImageForm((prev) => ({
                          ...prev,
                          format: e.target.value as SocialFormat,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    >
                      <option value="square">Facebook Square (1080x1080)</option>
                      <option value="portrait">Instagram Portrait (1080x1350)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold">Live Preview</h3>
                  <div className="mx-auto flex items-center justify-center">
                    <PredictedVsActualCard
                      ref={pvaCardRef}
                      format={pvaImageForm.format}
                      homeTeamName={
                        pvaImageForm.homeTeam ? getTeamNameById(Number(pvaImageForm.homeTeam)) : ''
                      }
                      awayTeamName={
                        pvaImageForm.awayTeam ? getTeamNameById(Number(pvaImageForm.awayTeam)) : ''
                      }
                      homeTeamLogo={
                        pvaImageForm.homeTeam ? getTeamLogoById(Number(pvaImageForm.homeTeam)) : undefined
                      }
                      awayTeamLogo={
                        pvaImageForm.awayTeam ? getTeamLogoById(Number(pvaImageForm.awayTeam)) : undefined
                      }
                      predictedText={
                        pvaImageForm.predictedMargin === ''
                          ? '-'
                          : (() => {
                              const pm = Number(pvaImageForm.predictedMargin)
                              const r = Math.round(pm)
                              if (r === 0) return 'Draw'
                              const homeN = pvaImageForm.homeTeam
                                ? getTeamNameById(Number(pvaImageForm.homeTeam))
                                : 'Home Team'
                              const awayN = pvaImageForm.awayTeam
                                ? getTeamNameById(Number(pvaImageForm.awayTeam))
                                : 'Away Team'
                              return `${pm > 0 ? homeN : awayN} by ${Math.abs(r)}`
                            })()
                      }
                      actualText={
                        pvaImageForm.actualHomeScore === '' || pvaImageForm.actualAwayScore === ''
                          ? '-'
                          : `${pvaImageForm.actualHomeScore} - ${pvaImageForm.actualAwayScore}`
                      }
                      differenceText={
                        pvaDelta === null
                          ? 'Prediction difference: -'
                          : `Prediction difference: ${Math.round(pvaDelta)} points`
                      }
                      date={
                        pvaImageForm.matchDate
                          ? new Date(`${pvaImageForm.matchDate}T12:00:00`).toLocaleDateString(undefined, {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : new Date().toLocaleDateString()
                      }
                    />
                  </div>
                  <button
                    onClick={() => {
                      const homeN =
                        pvaImageForm.homeTeam ? getTeamNameById(Number(pvaImageForm.homeTeam)) : 'home'
                      const awayN =
                        pvaImageForm.awayTeam ? getTeamNameById(Number(pvaImageForm.awayTeam)) : 'away'
                      const datePart = pvaImageForm.matchDate || String(Date.now())
                      downloadCardAsPng(
                        pvaCardRef.current,
                        `predicted-vs-actual-${datePart}-${filenameSlugForExport(homeN)}-vs-${filenameSlugForExport(awayN)}.png`
                      )
                    }}
                    className="rounded-xl bg-black px-5 py-3 text-sm text-white hover:opacity-90"
                  >
                    Download PNG
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}