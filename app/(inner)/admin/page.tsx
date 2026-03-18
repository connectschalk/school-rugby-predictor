'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import TeamLogoUploader from '@/components/TeamLogoUploader'

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

  useEffect(() => {
    if (!authChecked) return
    loadTeams()
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
  }

  async function handleDeleteMatch(matchId: number) {
    const confirmed = window.confirm('Delete this match result?')
    if (!confirmed) return

    setDeleteMessage('')

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

      teams.forEach((team: any) => {
        const mainName = team.name.trim().toLowerCase()
        teamMap.set(mainName, team.id)

        if (team.synonyms) {
          const parts = team.synonyms.split(',')

          parts.forEach((syn: string) => {
            const cleaned = syn.trim().toLowerCase()
            if (cleaned) {
              teamMap.set(cleaned, team.id)
            }
          })
        }
      })

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
    } finally {
      setRecalculatingConsistency(false)
    }
  }

  const teamOptions = useMemo(() => teams, [teams])

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
            <p className="mt-2 text-gray-600">
              Logged in as {adminEmail}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Log out
          </button>
        </div>

        <p className="mt-4 text-gray-600">
          Add schools, add results, upload weekly Excel scores, upload team logos, view results, delete incorrect scores, and recalculate team consistency.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
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
                className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
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

          <section className="rounded-2xl border border-gray-200 p-6 shadow-sm">
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
                className="rounded-xl bg-black px-5 py-3 text-white hover:opacity-90"
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
        </div>

        <section className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
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

        <TeamLogoUploader />

        <section className="mt-8 rounded-2xl border border-gray-200 p-6 shadow-sm">
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

        <section className="mt-10 rounded-2xl border border-gray-200 p-6 shadow-sm">
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

        <section className="mt-10 rounded-2xl border border-gray-200 p-6 shadow-sm">
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
      </div>
    </main>
  )
}