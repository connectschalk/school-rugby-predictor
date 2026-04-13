'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/trackEvent'
import * as XLSX from 'xlsx'
import { toPng } from 'html-to-image'
import TeamLogoUploader from '@/components/TeamLogoUploader'
import PredictionCard from '@/components/admin/PredictionCard'
import PredictedVsActualCard from '@/components/admin/PredictedVsActualCard'

const ALLOWED_ADMIN_EMAIL = 'connect.schalk@gmail.com'

type Team = {
  id: number
  name: string
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

type UploadPreviewRow = {
  match_date: string
  team_a: string
  team_b: string
  team_a_score: number
  team_b_score: number
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

  const [consistencyMessage, setConsistencyMessage] = useState('')
  const [recalculatingConsistency, setRecalculatingConsistency] = useState(false)

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
    teamA: '',
    teamB: '',
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
    teamA: '',
    teamB: '',
    matchDate: new Date().toISOString().slice(0, 10),
    predictedMargin: '',
    actualTeamAScore: '',
    actualTeamBScore: '',
    format: 'square' as SocialFormat,
  })

  const matchCardRef = useRef<HTMLDivElement | null>(null)
  const rankingsCardRef = useRef<HTMLDivElement | null>(null)
  const pvaCardRef = useRef<HTMLDivElement | null>(null)
  const [studioMessage, setStudioMessage] = useState('')

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

      const email = session?.user?.email || ''

      if (!session || email !== ALLOWED_ADMIN_EMAIL) {
        router.push('/login')
        return
      }

      setAdminEmail(email)
      setAuthChecked(true)
    }

    checkAccess()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email || ''
      if (!session || email !== ALLOWED_ADMIN_EMAIL) {
        router.push('/login')
      }
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
      .select('id, name')
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

    const { data: existing } = await supabase
      .from('matches')
      .select('id')
      .eq('match_date', form.match_date)
      .eq('team_a_id', Number(form.team_a_id))
      .eq('team_b_id', Number(form.team_b_id))
      .eq('team_a_score', Number(form.team_a_score))
      .eq('team_b_score', Number(form.team_b_score))
      .limit(1)

    if (existing && existing.length > 0) {
      setMatchMessage('This exact match result already exists.')
      return
    }

    const { error } = await supabase.from('matches').insert([
      {
        match_date: form.match_date,
        season,
        team_a_id: Number(form.team_a_id),
        team_b_id: Number(form.team_b_id),
        team_a_score: Number(form.team_a_score),
        team_b_score: Number(form.team_b_score),
      },
    ])

    if (error) {
      setMatchMessage(`Could not save result: ${error.message}`)
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
      match_date: form.match_date,
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

  function getWeekNumberInSeason(dateStr: string) {
    const date = new Date(dateStr)
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const diffMs = date.getTime() - startOfYear.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return Math.floor(diffDays / 7) + 1
  }

  function buildGraphWithoutMatch(matches: MatchRow[], excludedMatchId: number) {
    const graph = new Map<number, Array<{ to: number; margin: number }>>()

    for (const match of matches) {
      if (match.id === excludedMatchId) continue

      if (!graph.has(match.team_a_id)) graph.set(match.team_a_id, [])
      if (!graph.has(match.team_b_id)) graph.set(match.team_b_id, [])

      const margin = match.team_a_score - match.team_b_score

      graph.get(match.team_a_id)!.push({
        to: match.team_b_id,
        margin,
      })

      graph.get(match.team_b_id)!.push({
        to: match.team_a_id,
        margin: -margin,
      })
    }

    return graph
  }

  function findPredictionPaths(
    graph: Map<number, Array<{ to: number; margin: number }>>,
    start: number,
    end: number,
    maxDepth: number
  ) {
    const results: Array<{ margin: number; depth: number }> = []

    function dfs(
      current: number,
      target: number,
      depth: number,
      visited: Set<number>,
      totalMargin: number
    ) {
      if (depth > maxDepth) return

      if (current === target && depth > 0) {
        results.push({ margin: totalMargin, depth })
        return
      }

      const neighbours = graph.get(current) || []

      for (const edge of neighbours) {
        if (visited.has(edge.to)) continue
        visited.add(edge.to)
        dfs(edge.to, target, depth + 1, visited, totalMargin + edge.margin)
        visited.delete(edge.to)
      }
    }

    const visited = new Set<number>([start])
    dfs(start, end, 0, visited, 0)

    return results
  }

  function averagePredictionFromPaths(paths: Array<{ margin: number; depth: number }>) {
    if (!paths.length) return null

    let weightedSum = 0
    let totalWeight = 0

    for (const path of paths) {
      const weight = 1 / path.depth
      weightedSum += path.margin * weight
      totalWeight += weight
    }

    if (totalWeight === 0) return null

    return weightedSum / totalWeight
  }

  async function handleRecalculateConsistency() {
    setConsistencyMessage('')
    setRecalculatingConsistency(true)

    try {
      const season = Number(seasonFilter)

      const { data: rawMatches, error: matchesError } = await supabase
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
        .eq('season', season)
        .order('match_date', { ascending: true })

      if (matchesError) {
        setConsistencyMessage(`Could not load matches: ${matchesError.message}`)
        setRecalculatingConsistency(false)
        return
      }

      const matchesForSeason: MatchRow[] = (rawMatches || []).map((m: any) => ({
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

      if (matchesForSeason.length === 0) {
        setConsistencyMessage('No matches found for this season.')
        setRecalculatingConsistency(false)
        return
      }

      const latestWeek = Math.max(...matchesForSeason.map((m) => getWeekNumberInSeason(m.match_date)))
      const fullSeasonMode = latestWeek >= 5
      const maxDepth = fullSeasonMode ? 3 : 2

      const teamStats = new Map<
        number,
        {
          prediction_error: number
          matches_evaluated: number
        }
      >()

      for (const team of teams) {
        teamStats.set(team.id, {
          prediction_error: 0,
          matches_evaluated: 0,
        })
      }

      for (const match of matchesForSeason) {
        const graph = buildGraphWithoutMatch(matchesForSeason, match.id)
        const paths = findPredictionPaths(
          graph,
          match.team_a_id,
          match.team_b_id,
          maxDepth
        )

        const prediction = averagePredictionFromPaths(paths)
        if (prediction === null) continue

        const actualMargin = match.team_a_score - match.team_b_score
        const error = Math.abs(actualMargin - prediction)

        const teamAStats = teamStats.get(match.team_a_id)
        const teamBStats = teamStats.get(match.team_b_id)

        if (teamAStats) {
          teamAStats.prediction_error += error
          teamAStats.matches_evaluated += 1
        }

        if (teamBStats) {
          teamBStats.prediction_error += error
          teamBStats.matches_evaluated += 1
        }
      }

      const rowsToUpsert = teams.map((team) => {
        const stats = teamStats.get(team.id) || {
          prediction_error: 0,
          matches_evaluated: 0,
        }

        const avgError =
          stats.matches_evaluated > 0
            ? stats.prediction_error / stats.matches_evaluated
            : 999

        const consistencyScore =
          stats.matches_evaluated > 0
            ? Math.max(0, Math.min(1, 1 - avgError / 30))
            : 0

        const sampleConfidence = fullSeasonMode
          ? 1
          : Math.min(stats.matches_evaluated / 5, 1)

        const adjustedConsistency = consistencyScore * sampleConfidence

        let anchorStatus = 'provisional'

        if (fullSeasonMode) {
          if (stats.matches_evaluated >= 5 && adjustedConsistency >= 0.85) {
            anchorStatus = 'trusted_anchor'
          } else if (stats.matches_evaluated >= 3 && adjustedConsistency >= 0.7) {
            anchorStatus = 'usable_reference'
          } else if (stats.matches_evaluated >= 2) {
            anchorStatus = 'unstable'
          } else {
            anchorStatus = 'provisional'
          }
        } else {
          if (stats.matches_evaluated >= 3 && adjustedConsistency >= 0.8) {
            anchorStatus = 'emerging'
          } else {
            anchorStatus = 'provisional'
          }
        }

        return {
          team_id: team.id,
          season,
          prediction_error: Math.round(stats.prediction_error * 100) / 100,
          matches_evaluated: stats.matches_evaluated,
          consistency_score: Math.round(consistencyScore * 1000) / 1000,
          sample_confidence: Math.round(sampleConfidence * 1000) / 1000,
          adjusted_consistency: Math.round(adjustedConsistency * 1000) / 1000,
          is_anchor: anchorStatus === 'trusted_anchor' || anchorStatus === 'usable_reference',
          anchor_status: anchorStatus,
          updated_at: new Date().toISOString(),
        }
      })

      const { error: upsertError } = await supabase
        .from('team_consistency')
        .upsert(rowsToUpsert, {
          onConflict: 'team_id,season',
        })

      if (upsertError) {
        setConsistencyMessage(`Could not save consistency results: ${upsertError.message}`)
        setRecalculatingConsistency(false)
        return
      }

      setConsistencyMessage(
        fullSeasonMode
          ? 'Consistency recalculated using full-season mode.'
          : 'Consistency recalculated using early-season cautious mode.'
      )

      await trackEvent('admin_recalculate_consistency', 'admin', {
        season,
        mode: fullSeasonMode ? 'full-season' : 'early-season',
      })
      await loadUsageEvents()
    } finally {
      setRecalculatingConsistency(false)
    }
  }

  function getTeamNameById(teamId: number) {
    return teams.find((team) => team.id === teamId)?.name || `Team ${teamId}`
  }

  function buildPredictionGraph(sourceMatches: MatchRow[]) {
    const graph: Record<string, Array<{ to: string; margin: number }>> = {}

    for (const match of sourceMatches) {
      const a = String(match.team_a_id)
      const b = String(match.team_b_id)
      const margin = match.team_a_score - match.team_b_score

      if (!graph[a]) graph[a] = []
      if (!graph[b]) graph[b] = []

      graph[a].push({ to: b, margin })
      graph[b].push({ to: a, margin: -margin })
    }

    return graph
  }

  function getWeightedPredictionMargin(teamAId: number, teamBId: number) {
    const direct = matches.find(
      (m) =>
        (m.team_a_id === teamAId && m.team_b_id === teamBId) ||
        (m.team_a_id === teamBId && m.team_b_id === teamAId)
    )

    if (direct) {
      const margin =
        direct.team_a_id === teamAId
          ? direct.team_a_score - direct.team_b_score
          : direct.team_b_score - direct.team_a_score
      return { margin: Math.round(margin), rationale: 'Direct result available from played fixture.' }
    }

    const graph = buildPredictionGraph(matches)
    const start = String(teamAId)
    const target = String(teamBId)
    const paths: Array<{ margin: number; depth: number }> = []
    const maxDepth = 5

    function dfs(
      current: string,
      depth: number,
      visited: Set<string>,
      cumulativeMargin: number
    ) {
      if (depth > maxDepth) return
      if (current === target && depth > 0) {
        paths.push({ margin: cumulativeMargin, depth })
        return
      }
      const neighbours = graph[current] || []
      for (const edge of neighbours) {
        if (visited.has(edge.to)) continue
        visited.add(edge.to)
        dfs(edge.to, depth + 1, visited, cumulativeMargin + edge.margin)
        visited.delete(edge.to)
      }
    }

    dfs(start, 0, new Set<string>([start]), 0)

    if (!paths.length) {
      return {
        margin: null as number | null,
        rationale: 'Not enough linked data to produce a prediction yet.',
      }
    }

    const weighted = paths.reduce(
      (acc, path) => {
        const weight = 1 / path.depth
        acc.sum += path.margin * weight
        acc.weight += weight
        return acc
      },
      { sum: 0, weight: 0 }
    )

    return {
      margin: Math.round((weighted.sum / weighted.weight) * 10) / 10,
      rationale: `Model weighted ${paths.length} connected path(s) across current season results.`,
    }
  }

  const socialPrediction = useMemo(() => {
    if (!matchImageForm.teamA || !matchImageForm.teamB) {
      return {
        margin: null as number | null,
        headline: 'Select two teams',
        rationale: 'Choose Team A and Team B to generate a prediction image.',
      }
    }
    if (matchImageForm.teamA === matchImageForm.teamB) {
      return {
        margin: null as number | null,
        headline: 'Choose different teams',
        rationale: 'Team A and Team B cannot be the same.',
      }
    }

    const teamAId = Number(matchImageForm.teamA)
    const teamBId = Number(matchImageForm.teamB)
    const prediction = getWeightedPredictionMargin(teamAId, teamBId)
    const teamAName = getTeamNameById(teamAId)
    const teamBName = getTeamNameById(teamBId)

    if (prediction.margin === null) {
      return {
        margin: null,
        headline: 'Prediction unavailable',
        rationale: prediction.rationale,
      }
    }

    if (prediction.margin === 0) {
      return {
        margin: 0,
        headline: `${teamAName} and ${teamBName} to draw`,
        rationale: prediction.rationale,
      }
    }

    const winner = prediction.margin > 0 ? teamAName : teamBName
    return {
      margin: prediction.margin,
      headline: `${winner} by ${Math.abs(prediction.margin)}`,
      rationale: prediction.rationale,
    }
  }, [matchImageForm.teamA, matchImageForm.teamB, matches, teams])

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

  const pvaDelta = useMemo(() => {
    const predicted = Number(pvaImageForm.predictedMargin)
    const a = Number(pvaImageForm.actualTeamAScore)
    const b = Number(pvaImageForm.actualTeamBScore)
    if (Number.isNaN(predicted) || Number.isNaN(a) || Number.isNaN(b)) return null
    const actualMargin = a - b
    return Math.abs(predicted - actualMargin)
  }, [
    pvaImageForm.predictedMargin,
    pvaImageForm.actualTeamAScore,
    pvaImageForm.actualTeamBScore,
  ])

  async function downloadCardAsPng(ref: HTMLDivElement | null, filename: string) {
    if (!ref) return
    try {
      const dataUrl = await toPng(ref, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const link = document.createElement('a')
      link.download = filename
      link.href = dataUrl
      link.click()
      setStudioMessage('Image downloaded.')
    } catch {
      setStudioMessage('Could not export image.')
    }
  }

  function cardDimensions(format: SocialFormat) {
    if (format === 'portrait') return { width: 540, height: 675 }
    return { width: 540, height: 540 }
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
          Add schools, add results, upload weekly Excel scores, upload team logos, view results,
          delete incorrect scores, recalculate team consistency, and monitor usage.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
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
              <h2 className="text-xl font-semibold">Recalculate Team Consistency</h2>
              <p className="mt-2 text-sm text-gray-600">
                Weeks 1-4 use cautious mode. From week 5 onward, all season data is used and anchor teams update automatically.
              </p>

              <button
                onClick={handleRecalculateConsistency}
                disabled={recalculatingConsistency}
                className="mt-4 rounded-xl bg-black px-5 py-3 text-white hover:opacity-90 disabled:opacity-50"
              >
                {recalculatingConsistency ? 'Recalculating...' : 'Recalculate consistency'}
              </button>

              {consistencyMessage && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                  {consistencyMessage}
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
                  <div>
                    <label className="mb-2 block text-sm font-medium">Team A</label>
                    <select
                      value={matchImageForm.teamA}
                      onChange={(e) => setMatchImageForm((prev) => ({ ...prev, teamA: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
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
                      value={matchImageForm.teamB}
                      onChange={(e) => setMatchImageForm((prev) => ({ ...prev, teamB: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
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
                  <div
                    ref={matchCardRef}
                    className="mx-auto flex items-center justify-center"
                    style={cardDimensions(matchImageForm.format)}
                  >
                    <PredictionCard
                      teamAName={
                        matchImageForm.teamA ? getTeamNameById(Number(matchImageForm.teamA)) : ''
                      }
                      teamBName={
                        matchImageForm.teamB ? getTeamNameById(Number(matchImageForm.teamB)) : ''
                      }
                      predictionMargin={socialPrediction.margin}
                      date={matchImageForm.matchDate || new Date().toISOString().slice(0, 10)}
                      rationale={matchImageForm.rationale || socialPrediction.rationale}
                    />
                  </div>
                  <button
                    onClick={() =>
                      downloadCardAsPng(
                        matchCardRef.current,
                        `match-prediction-${matchImageForm.matchDate || Date.now()}.png`
                      )
                    }
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
                  <div
                    ref={rankingsCardRef}
                    className="mx-auto rounded-3xl border border-gray-200 bg-white p-10 shadow-sm"
                    style={cardDimensions(rankingsImageForm.format)}
                  >
                    <img src="/nextplay-predictor.png" alt="NextPlay Predictor" className="mx-auto h-14 w-auto" />
                    <p className="mt-4 text-center text-sm text-gray-500">
                      {new Date().toLocaleDateString()}
                    </p>
                    <p className="mt-6 text-center text-xs uppercase tracking-[0.18em] text-gray-500">
                      Network Rankings
                    </p>
                    <div className="mt-6 space-y-2">
                      {rankingListForImage.map((team, index) => (
                        <div key={team.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <span className="text-sm font-semibold text-gray-500">{index + 1}</span>
                          <span className="ml-3 flex-1 text-sm font-medium text-gray-900">{team.name}</span>
                        </div>
                      ))}
                      {rankingListForImage.length === 0 && (
                        <p className="text-sm text-gray-500">No ranking data found for this season.</p>
                      )}
                    </div>
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
                  <div>
                    <label className="mb-2 block text-sm font-medium">Team A</label>
                    <select
                      value={pvaImageForm.teamA}
                      onChange={(e) => setPvaImageForm((prev) => ({ ...prev, teamA: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
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
                      value={pvaImageForm.teamB}
                      onChange={(e) => setPvaImageForm((prev) => ({ ...prev, teamB: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
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
                    <label className="mb-2 block text-sm font-medium">Match Date</label>
                    <input
                      type="date"
                      value={pvaImageForm.matchDate}
                      onChange={(e) =>
                        setPvaImageForm((prev) => ({ ...prev, matchDate: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Predicted Margin</label>
                    <input
                      type="number"
                      value={pvaImageForm.predictedMargin}
                      onChange={(e) =>
                        setPvaImageForm((prev) => ({ ...prev, predictedMargin: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      placeholder="Positive = Team A by, negative = Team B by"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">Actual Team A Score</label>
                      <input
                        type="number"
                        value={pvaImageForm.actualTeamAScore}
                        onChange={(e) =>
                          setPvaImageForm((prev) => ({ ...prev, actualTeamAScore: e.target.value }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Actual Team B Score</label>
                      <input
                        type="number"
                        value={pvaImageForm.actualTeamBScore}
                        onChange={(e) =>
                          setPvaImageForm((prev) => ({ ...prev, actualTeamBScore: e.target.value }))
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3"
                      />
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
                  <div
                    ref={pvaCardRef}
                    className="mx-auto flex items-center justify-center"
                    style={cardDimensions(pvaImageForm.format)}
                  >
                    <PredictedVsActualCard
                      teamAName={pvaImageForm.teamA ? getTeamNameById(Number(pvaImageForm.teamA)) : ''}
                      teamBName={pvaImageForm.teamB ? getTeamNameById(Number(pvaImageForm.teamB)) : ''}
                      predictedText={
                        pvaImageForm.predictedMargin === ''
                          ? '-'
                          : `${Number(pvaImageForm.predictedMargin) > 0 ? 'Team A' : 'Team B'} by ${Math.abs(
                              Number(pvaImageForm.predictedMargin)
                            )}`
                      }
                      actualText={
                        pvaImageForm.actualTeamAScore === '' || pvaImageForm.actualTeamBScore === ''
                          ? '-'
                          : `${pvaImageForm.actualTeamAScore} - ${pvaImageForm.actualTeamBScore}`
                      }
                      differenceText={
                        pvaDelta === null
                          ? 'Prediction difference: -'
                          : `Prediction difference: ${pvaDelta} points`
                      }
                      date={pvaImageForm.matchDate || new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <button
                    onClick={() =>
                      downloadCardAsPng(
                        pvaCardRef.current,
                        `predicted-vs-actual-${pvaImageForm.matchDate || Date.now()}.png`
                      )
                    }
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