/**
 * Admin competition fixture/results import (CSV / XLSX).
 * Competition is determined by the admin route — not the upload file.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import {
  formatInstantAsJohannesburgWallClock,
  parseJohannesburgKickoff,
} from '@/lib/admin-kickoff-johannesburg'
import { splitCsvLine } from '@/lib/parse-game-matches-bulk'
import { getCompetitionBySlug } from '@/lib/competitions'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'

export type AdminImportRow = {
  rowNumber: number
  external_id?: string | null
  fixture_round?: string | null
  league_group?: string | null
  /** Full datetime when a single column carries date+time. */
  kickoff?: string | null
  /** Date-only column (paired with kickoff_time_part). */
  kickoff_date?: string | null
  /** Time-only column (paired with kickoff_date). */
  kickoff_time_part?: string | null
  home_team?: string | null
  away_team?: string | null
  venue?: string | null
  status?: string | null
  home_score?: string | number | null
  away_score?: string | number | null
  competition_slug?: string | null
}

export type AdminImportSummary = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  preview?: AdminImportRow[]
  scored?: number
  scoring_errors?: string[]
}

const HEADER_MAP: Record<string, keyof AdminImportRow> = {
  external_id: 'external_id',
  externalid: 'external_id',
  fixture_id: 'external_id',
  match_id: 'external_id',
  round: 'fixture_round',
  fixture_round: 'fixture_round',
  group: 'league_group',
  league_group: 'league_group',
  province_group: 'league_group',
  kickoff: 'kickoff',
  kick_off: 'kickoff',
  datetime: 'kickoff',
  date: 'kickoff_date',
  match_date: 'kickoff_date',
  fixture_date: 'kickoff_date',
  kickoff_date: 'kickoff_date',
  kickoff_time: 'kickoff_time_part',
  kick_off_time: 'kickoff_time_part',
  match_time: 'kickoff_time_part',
  time: 'kickoff_time_part',
  home_team: 'home_team',
  home: 'home_team',
  home_team_name: 'home_team',
  away_team: 'away_team',
  away: 'away_team',
  away_team_name: 'away_team',
  venue: 'venue',
  status: 'status',
  home_score: 'home_score',
  away_score: 'away_score',
  competition_slug: 'competition_slug',
  competition: 'competition_slug',
  slug: 'competition_slug',
}

const SHEET_HINTS: Record<string, string[]> = {
  'nextplay-schools': ['school rugby fixtures', 'schools fixtures', 'nextplay schools', 'fixtures'],
  'craven-week': ['craven week fixtures', 'craven week', 'craven'],
  'soccer-world-cup': ['soccer world cup fixtures', 'world cup fixtures', 'soccer world cup', 'world cup'],
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return formatInstantAsJohannesburgWallClock(v)
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 20000 && v < 100000 && XLSX.SSF?.parse_date_code) {
      const dc = XLSX.SSF.parse_date_code(v)
      if (dc) {
        return `${dc.y}-${pad2(dc.m)}-${pad2(dc.d)} ${pad2(dc.H)}:${pad2(dc.M)}`
      }
    }
    return String(v)
  }
  return String(v).trim()
}

/** Parse admin upload kickoff strings (CSV/XLSX) as Africa/Johannesburg. */
export function parseCompetitionImportKickoff(raw: string): string | null {
  return parseJohannesburgKickoff(raw)
}

export function adminImportKickoffDisplay(row: AdminImportRow): string {
  const full = row.kickoff?.trim() ?? ''
  const datePart = row.kickoff_date?.trim() ?? ''
  const timePart = row.kickoff_time_part?.trim() ?? ''

  if (full && (full.includes('T') || /\d{1,2}:\d{2}/.test(full))) return full
  if (datePart && timePart) return `${datePart} ${timePart}`
  if (datePart && /\d{1,2}:\d{2}/.test(datePart)) return datePart
  if (datePart && full && /^\d{1,2}:\d{2}$/.test(full)) return `${datePart} ${full}`
  if (datePart) return datePart
  return full
}

function resolveKickoffRaw(row: AdminImportRow): string {
  return adminImportKickoffDisplay(row)
}

function parseKickoff(raw: string): string | null {
  return parseCompetitionImportKickoff(raw)
}

function normalizeStatus(raw: string | null | undefined): 'upcoming' | 'locked' | 'completed' | 'cancelled' {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'completed' || s === 'final' || s === 'played') return 'completed'
  if (s === 'locked' || s === 'live') return 'locked'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (s === 'scheduled' || s === 'upcoming' || s === '') return 'upcoming'
  return 'upcoming'
}

function parseScore(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

function pickSheetName(names: string[], competitionSlug: string): string {
  const hints = SHEET_HINTS[competitionSlug] ?? []
  const lower = names.map((n) => ({ n, l: n.toLowerCase() }))
  for (const hint of hints) {
    const hit = lower.find((x) => x.l.includes(hint))
    if (hit) return hit.n
  }
  return names[0] ?? 'Sheet1'
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0]).map(normalizeHeader)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i])
    if (cells.every((c) => !c.trim())) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

export function parseWorkbookBuffer(
  buffer: ArrayBuffer,
  competitionSlug: string,
  sheetName?: string
): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const targetSheet = sheetName && wb.SheetNames.includes(sheetName)
    ? sheetName
    : pickSheetName(wb.SheetNames, competitionSlug)
  const sheet = wb.Sheets[targetSheet]
  if (!sheet) return []
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return json.map((row) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) {
      out[normalizeHeader(k)] = cellStr(v)
    }
    return out
  })
}

export function mapRawRows(rawRows: Record<string, string>[]): AdminImportRow[] {
  return rawRows.map((raw, idx) => {
    const row: AdminImportRow = { rowNumber: idx + 2 }
    for (const [key, val] of Object.entries(raw)) {
      const field = HEADER_MAP[key]
      if (!field || field === 'rowNumber') continue
      ;(row as Record<string, unknown>)[field] = val
    }
    return row
  })
}

export function validateCompetitionSlugInRows(
  rows: AdminImportRow[],
  expectedSlug: string
): string[] {
  const errors: string[] = []
  const expected = expectedSlug.trim().toLowerCase()
  for (const row of rows) {
    const slug = row.competition_slug?.trim().toLowerCase()
    if (slug && slug !== expected) {
      errors.push(
        `Row ${row.rowNumber}: competition_slug "${slug}" does not match selected competition "${expected}". Upload rejected.`
      )
    }
  }
  return errors
}

async function findMatchId(
  client: SupabaseClient,
  competitionId: string,
  row: AdminImportRow,
  kickoffIso: string | null
): Promise<string | null> {
  const externalId = row.external_id?.trim()
  if (externalId) {
    const { data } = await client
      .from('game_matches')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('external_id', externalId)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }
  if (!kickoffIso) return null
  const home = row.home_team?.trim() ?? ''
  const away = row.away_team?.trim() ?? ''
  const { data } = await client
    .from('game_matches')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('kickoff_time', kickoffIso)
    .eq('home_team', home)
    .eq('away_team', away)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

function buildAdminNotes(venue?: string | null): string | null {
  const v = venue?.trim()
  return v ? `Venue: ${v}` : null
}

export async function importCompetitionFixturesAdmin(
  client: SupabaseClient,
  competitionSlug: string,
  rows: AdminImportRow[],
  options: { dryRun?: boolean } = {}
): Promise<AdminImportSummary> {
  const { competition, error: compErr } = await getCompetitionBySlug(client, competitionSlug)
  if (compErr || !competition) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [compErr ?? 'Competition not found'] }
  }

  const slugErrors = validateCompetitionSlugInRows(rows, competition.slug)
  if (slugErrors.length > 0) {
    return { inserted: 0, updated: 0, skipped: 0, errors: slugErrors, preview: rows.slice(0, 20) }
  }

  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const home = row.home_team?.trim() ?? ''
    const away = row.away_team?.trim() ?? ''
    if (!home || !away) {
      errors.push(`Row ${row.rowNumber}: home_team and away_team are required`)
      continue
    }
    if (home.toLowerCase() === away.toLowerCase()) {
      errors.push(`Row ${row.rowNumber}: home_team and away_team must differ`)
      continue
    }
    const kickoffRaw = resolveKickoffRaw(row)
    if (!kickoffRaw) {
      errors.push(`Row ${row.rowNumber}: kickoff is required`)
      continue
    }
    const kickoffIso = parseKickoff(kickoffRaw)
    if (!kickoffIso) {
      errors.push(`Row ${row.rowNumber}: invalid kickoff "${kickoffRaw}"`)
      continue
    }

    const payload: Record<string, unknown> = {
      competition_id: competition.id,
      home_team: home,
      away_team: away,
      kickoff_time: kickoffIso,
      status: normalizeStatus(row.status),
      verification_status: 'verified',
      source_type: 'admin_competition_import',
      source_name: `admin:${competition.slug}`,
    }
    const externalId = row.external_id?.trim()
    if (externalId) payload.external_id = externalId
    const round = row.fixture_round?.trim()
    if (round) payload.fixture_round = round
    const group = row.league_group?.trim()
    if (group) payload.league_group = group
    const notes = buildAdminNotes(row.venue)
    if (notes) payload.admin_notes = notes

    if (options.dryRun) continue

    const existingId = await findMatchId(client, competition.id, row, kickoffIso)
    if (existingId) {
      const { error: upErr } = await client.from('game_matches').update(payload).eq('id', existingId)
      if (upErr) errors.push(`Row ${row.rowNumber}: update failed — ${upErr.message}`)
      else updated += 1
    } else {
      const { error: insErr } = await client.from('game_matches').insert(payload)
      if (insErr) errors.push(`Row ${row.rowNumber}: insert failed — ${insErr.message}`)
      else inserted += 1
    }
  }

  if (options.dryRun) {
    return {
      inserted: rows.length,
      updated: 0,
      skipped: 0,
      errors,
      preview: rows.slice(0, 50),
    }
  }

  return { inserted, updated, skipped, errors, preview: rows.slice(0, 20) }
}

export async function importCompetitionResultsAdmin(
  client: SupabaseClient,
  competitionSlug: string,
  rows: AdminImportRow[],
  options: { dryRun?: boolean; runScoring?: boolean } = {}
): Promise<AdminImportSummary> {
  const { competition, error: compErr } = await getCompetitionBySlug(client, competitionSlug)
  if (compErr || !competition) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [compErr ?? 'Competition not found'] }
  }

  const slugErrors = validateCompetitionSlugInRows(rows, competition.slug)
  if (slugErrors.length > 0) {
    return { inserted: 0, updated: 0, skipped: 0, errors: slugErrors, preview: rows.slice(0, 20) }
  }

  let updated = 0
  let skipped = 0
  const errors: string[] = []
  const scoredMatchIds: string[] = []

  for (const row of rows) {
    const homeScore = parseScore(row.home_score)
    const awayScore = parseScore(row.away_score)
    if (homeScore == null || awayScore == null) {
      errors.push(`Row ${row.rowNumber}: home_score and away_score are required`)
      continue
    }

    const kickoffRaw = resolveKickoffRaw(row)
    const externalId = row.external_id?.trim()
    const home = row.home_team?.trim() ?? ''
    const away = row.away_team?.trim() ?? ''

    if (!externalId && (!kickoffRaw || !home || !away)) {
      errors.push(
        `Row ${row.rowNumber}: provide external_id OR (kickoff + home_team + away_team)`
      )
      continue
    }

    const kickoffIso = kickoffRaw ? parseKickoff(kickoffRaw) : null
    if (kickoffRaw && !kickoffIso) {
      errors.push(`Row ${row.rowNumber}: invalid kickoff "${kickoffRaw}"`)
      continue
    }

    if (options.dryRun) {
      updated += 1
      continue
    }

    const matchId = await findMatchId(client, competition.id, row, kickoffIso)
    if (!matchId) {
      errors.push(`Row ${row.rowNumber}: no matching fixture found in ${competition.slug}`)
      skipped += 1
      continue
    }

    const { error: upErr } = await client
      .from('game_matches')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: 'completed',
      })
      .eq('id', matchId)
      .eq('competition_id', competition.id)

    if (upErr) {
      errors.push(`Row ${row.rowNumber}: update failed — ${upErr.message}`)
      continue
    }
    updated += 1
    scoredMatchIds.push(matchId)
  }

  const scoring_errors: string[] = []
  let scored = 0
  if (!options.dryRun && options.runScoring !== false) {
    for (const matchId of scoredMatchIds) {
      const { error } = await rpcScorePredictionsForMatch(client, matchId)
      if (error) scoring_errors.push(`${matchId}: ${error.message}`)
      else scored += 1
    }
  }

  return {
    inserted: 0,
    updated,
    skipped,
    errors,
    preview: rows.slice(0, 20),
    scored,
    scoring_errors,
  }
}

export function parseUploadToRows(
  buffer: ArrayBuffer,
  filename: string,
  competitionSlug: string,
  sheetName?: string
): AdminImportRow[] {
  const lower = filename.toLowerCase()
  let raw: Record<string, string>[] = []
  if (lower.endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer)
    raw = parseCsvText(text).rows
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    raw = parseWorkbookBuffer(buffer, competitionSlug, sheetName)
  } else {
    const text = new TextDecoder().decode(buffer)
    raw = parseCsvText(text).rows
  }
  return mapRawRows(raw)
}
