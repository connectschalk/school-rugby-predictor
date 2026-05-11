import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { buildStructuredWarningsFromStrings, type SyncWarningItem } from '@/lib/sync-master-warnings'
import { splitCsvLine } from '@/lib/parse-game-matches-bulk'
import type { FixtureCsvRow } from '@/lib/parse-fixtures-sheet-csv'
import { normalizeDate, normalizeTime, parseFixturesSheetCsv } from '@/lib/parse-fixtures-sheet-csv'
import { dateInSastFromIso } from '@/lib/sast-date'
import {
  collectGroupLinkResolutionWarnings,
  computeFixtureGroupLinkIds,
  effectiveGroupFieldsForMatchRow,
  loadFixtureGroupMaps,
  normalizeLeagueGroupForGameMatches,
  normalizeProvinceLabelForGameMatches,
  type FixtureGroupLinkInput,
  type FixtureGroupMaps,
  type GroupLinkWarningEffective,
  type SheetClassificationForWarnings,
} from '@/lib/fixture-group-resolve'
import {
  buildTeamsRegistryDebug,
  parseTeamsSheetCsv,
  SheetTeamsRegistry,
  teamLookupNormalize,
  type TeamsRegistryDebug,
  type TeamsRegistryUnresolvedTeam,
} from '@/lib/sheet-teams-registry'
import type { TeamAliasDbRow } from '@/lib/team-aliases-db'
import { upsertTeamsAndAliasesFromTeamsSheet } from '@/lib/sync-teams-from-sheet'
import {
  buildSheetSyncAliasMap,
  canonicalTeamLabelForGameMatches,
} from '@/lib/team-canonical-for-sync'
import { normalizeTeamKeyAsciiFold, type TeamRow } from '@/lib/team-name-match'
import {
  buildStableSheetFixtureKey,
  normalizeStableFixtureKeyForLookup,
} from '@/lib/sync-sheet-fixture-key'

export const runtime = 'nodejs'

const SYNC_IMPORT_MAX_MS = 45_000
const SYNC_BATCH_SIZE = 50

const SYNC_SHEET_LOG = '[sync-master-sheet]'

const FORBIDDEN_WRITE_KEYS = new Set(['id', 'created_at', 'updated_at'])

/** Strip server-generated / key columns from insert/update JSON bodies. */
function stripForbiddenWritePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (FORBIDDEN_WRITE_KEYS.has(k)) continue
    out[k] = v
  }
  return out
}

function payloadForbiddenKeys(body: Record<string, unknown>): string[] {
  const bad: string[] = []
  for (const k of FORBIDDEN_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) bad.push(k)
  }
  return bad
}

const GM_SKIP_UNIQUE_PAIR_UPDATE_FIX =
  'Skipped update because another fixture already exists with the same teams and kickoff.'
const GM_SKIP_UNIQUE_PAIR_INSERT_FIX =
  'Skipped insert because another fixture already exists with the same teams and kickoff.'

function formatGmUpdateSkippedUniquePairWarning(
  currentId: string,
  conflictId: string,
  payload: Record<string, unknown>
): string {
  const home_team = String(payload.home_team ?? '')
  const away_team = String(payload.away_team ?? '')
  const kickoff_time = String(payload.kickoff_time ?? '')
  return `Warning: Skipped game_matches update (unique pair conflict). currentId=${currentId} conflictId=${conflictId} home_team=${JSON.stringify(home_team)} away_team=${JSON.stringify(away_team)} kickoff_time=${JSON.stringify(kickoff_time)}. ${GM_SKIP_UNIQUE_PAIR_UPDATE_FIX}`
}

function formatGmInsertSkippedUniquePairWarning(conflictId: string, payload: Record<string, unknown>): string {
  const home_team = String(payload.home_team ?? '')
  const away_team = String(payload.away_team ?? '')
  const kickoff_time = String(payload.kickoff_time ?? '')
  return `Warning: Skipped game_matches insert (unique pair conflict). conflictId=${conflictId} home_team=${JSON.stringify(home_team)} away_team=${JSON.stringify(away_team)} kickoff_time=${JSON.stringify(kickoff_time)}. ${GM_SKIP_UNIQUE_PAIR_INSERT_FIX}`
}

/**
 * Same shape as `game_matches_verified_kickoff_pair_uidx` (verified rows only):
 * kickoff_time + unordered lower(trim) home/away pair.
 */
function verifiedUniqueTripletKey(
  kickoff: string,
  home: string,
  away: string,
  verificationStatus: string | null | undefined
): string | null {
  const vs = String(verificationStatus ?? '').trim().toLowerCase()
  if (vs !== 'verified') return null
  const ko = String(kickoff).trim()
  if (!ko) return null
  return `${ko}|${orderedPairKey(home, away)}`
}

function verifiedUniqueTripletKeyFromPayload(payload: Record<string, unknown>): string | null {
  return verifiedUniqueTripletKey(
    String(payload.kickoff_time ?? ''),
    String(payload.home_team ?? ''),
    String(payload.away_team ?? ''),
    (payload.verification_status as string | undefined) ?? 'verified'
  )
}

/**
 * If applying `updatePayload` to `currentId` would duplicate another row's verified unique triplet, return that row's id.
 */
function findConflictingGameMatch(
  updatePayload: Record<string, unknown>,
  currentId: string,
  uniqueVerifiedTripletToId: Map<string, string>
): string | null {
  const k = verifiedUniqueTripletKeyFromPayload(updatePayload)
  if (!k) return null
  const occupant = uniqueVerifiedTripletToId.get(k)
  if (occupant && occupant !== currentId) return occupant
  return null
}

function buildKickoffPairOccupantMap(gmById: Map<string, ExistingGameMatchSyncRow>): Map<string, string> {
  const m = new Map<string, string>()
  for (const gm of gmById.values()) {
    const pk = uniqueKickoffPairKey(gm.kickoff_time, gm.home_team, gm.away_team)
    if (!pk) continue
    m.set(pk, gm.id)
  }
  return m
}

function buildFixtureNormOccupantMap(gmById: Map<string, ExistingGameMatchSyncRow>): Map<string, string> {
  const m = new Map<string, string>()
  for (const gm of gmById.values()) {
    const fk = gm.fixture_key?.trim()
    if (!fk) continue
    m.set(normalizeStableFixtureKeyForLookup(fk), gm.id)
  }
  return m
}

export const SYNC_IMPORT_FOLLOWUP_NOTICE =
  'Sync imports fixtures only. Run group linking and scoring separately.'

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

type SyncSummary = {
  mode: 'dry_run' | 'run'
  replace_upcoming: boolean
  incoming_rows: number
  would_insert_upcoming: number
  would_update_upcoming: number
  would_reactivate_upcoming: number
  would_reject_old_upcoming: number
  would_insert_completed: number
  would_update_completed: number
  /** Same as would_insert_completed — completed sheet rows → new game_matches */
  would_insert_completed_game_matches: number
  /** Same as would_update_completed — completed sheet rows → update existing game_matches */
  would_update_completed_game_matches: number
  inserted_upcoming: number
  updated_upcoming: number
  reactivated_upcoming: number
  rejected_old_upcoming: number
  inserted_completed: number
  updated_completed: number
  skipped_duplicates: number
  province_group_warnings: number
  would_link_groups: number
  linked_groups: number
  group_link_warnings: number
  /** DB failures while writing `game_match_groups` (delete/insert); capped at budget max during run. */
  group_link_failures?: number
  /** Rows where group linking was skipped because the failure budget was reached. */
  skipped_group_linking_count?: number
  /** New `game_matches` rows inserted this run (upcoming + completed). */
  game_matches_inserted?: number
  /** Existing `game_matches` rows updated this run (upcoming + completed). */
  game_matches_updated?: number
  matches_inserted?: number
  matches_updated?: number
  sync_import_notice?: string
  last_processed_fixture_row?: string
  /** Legacy counters — always 0 (linking/scoring removed from import). */
  completed_matches_scored?: number
  post_sync_sweep_scored?: number
  post_sync_sweep_attempted?: number
  group_link_repair_examined?: number
  group_link_repair_linked?: number
  validation_errors: string[]
  warnings: SyncWarningItem[]
  /** Present on dry-run (preview) responses and stored on preview `sync_runs.summary`. */
  teams_registry_debug?: TeamsRegistryDebug
  /** One-time legacy pass: rows that had empty `fixture_key` and received a stable sheet key (live sync only). */
  fixture_key_backfilled?: number
}

/** Redact spreadsheet id in Google Sheets CSV URLs for safe preview logging. */
function maskTeamsCsvUrl(url: string): string {
  const t = url.trim()
  if (!t) return '(empty)'
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{6,})\//)
  if (m?.[1]) {
    const id = m[1]
    const masked = id.length <= 10 ? `${id.slice(0, 2)}…` : `${id.slice(0, 4)}…${id.slice(-4)}`
    return t.replace(id, masked)
  }
  return t.length > 120 ? `${t.slice(0, 55)}…${t.slice(-40)}` : t
}

/**
 * Pre-load and batch-create `teams` rows for all canonical names on completed fixtures (no per-row DB calls in sync loop).
 */
async function batchEnsureTeamIdsForCompletedRows(
  supabase: SupabaseClient,
  normalized: NormalizedSheetRow[],
  teams: TeamRow[],
  cache: Map<string, number>,
  errors: string[]
): Promise<void> {
  for (const t of teams) {
    const k = teamLookupNormalize(t.name)
    if (k) cache.set(k, t.id)
  }

  const names = new Set<string>()
  for (const row of normalized) {
    if (row.status !== 'completed') continue
    if (row.home_score == null || row.away_score == null) continue
    if (teamLookupNormalize(row.home_team) === teamLookupNormalize(row.away_team)) continue
    names.add(row.home_team.trim())
    names.add(row.away_team.trim())
  }

  const missingByNorm = new Map<string, string>()
  for (const name of names) {
    const k = teamLookupNormalize(name)
    if (!k) continue
    if (cache.has(k)) continue
    if (!missingByNorm.has(k)) missingByNorm.set(k, name.trim())
  }

  const toCreate = [...missingByNorm.values()]
  for (const part of chunkArray(toCreate, SYNC_BATCH_SIZE)) {
    const { data, error } = await supabase.from('teams').insert(part.map((name) => ({ name }))).select('id, name')
    if (!error && data?.length) {
      for (const row of data) {
        const id = Number(row.id)
        const nm = String(row.name ?? '')
        const k = teamLookupNormalize(nm)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: nm })
        }
      }
      continue
    }
    for (const name of part) {
      const { data: one, error: e2 } = await supabase.from('teams').insert({ name }).select('id, name').maybeSingle()
      if (!e2 && one?.id != null) {
        const id = Number(one.id)
        const k = teamLookupNormalize(name)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: String(one.name ?? name) })
        }
        continue
      }
      const { data: sel } = await supabase.from('teams').select('id, name').eq('name', name).maybeSingle()
      if (sel?.id != null) {
        const id = Number(sel.id)
        const k = teamLookupNormalize(name)
        if (Number.isFinite(id) && k) {
          cache.set(k, id)
          if (!teams.some((t) => t.id === id)) teams.push({ id, name: String(sel.name ?? name) })
        }
      } else {
        errors.push(`Could not create or resolve team "${name}": ${e2?.message ?? error?.message ?? 'unknown'}`)
      }
    }
  }
}

function parseBool(v: string): boolean {
  const x = v.trim().toLowerCase()
  return x === 'true' || x === '1' || x === 'yes' || x === 'y'
}

function toSastKickoffIso(dateYmd: string, hhmm: string): string {
  return `${dateYmd}T${hhmm}:00+02:00`
}

function normalizeGameMatchStatus(v: string): 'upcoming' | 'locked' | 'completed' | 'cancelled' {
  const s = v.trim().toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'locked') return 'locked'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'upcoming'
}

function shouldPersistInterprovincial(homeProvince: string, awayProvince: string): boolean {
  const h = homeProvince.trim().toLowerCase()
  const a = awayProvince.trim().toLowerCase()
  if (!h || !a) return false
  return h !== a
}

/** One sheet row where a canonical team is home or away on `matchDate`. */
type TeamDateDupAppearance = {
  sheet_row: number
  home_team: string
  away_team: string
}

/** Track canonical team vs calendar date for critical duplicate detection (stricter than same-pair duplicate). */
function recordTeamDateDup(
  map: Map<string, { teamLabel: string; matchDate: string; rows: TeamDateDupAppearance[] }>,
  teamLabel: string,
  matchDate: string,
  sheetRow: number,
  homeTeam: string,
  awayTeam: string
) {
  const nk = normalizeTeamKeyAsciiFold(teamLabel)
  if (!nk) return
  const key = `${matchDate}|${nk}`
  let b = map.get(key)
  if (!b) {
    b = { teamLabel: teamLabel.trim(), matchDate, rows: [] }
    map.set(key, b)
  }
  b.rows.push({ sheet_row: sheetRow, home_team: homeTeam, away_team: awayTeam })
}

type NormalizedSheetRow = {
  kickoff_time: string
  match_date: string
  /** Stored on `game_matches` — canonical_name from Teams tab. */
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  league_group: string
  home_team_province: string
  away_team_province: string
  is_interprovincial: boolean
  has_wp_elite_team: boolean
  home_is_prestige_team: boolean
  away_is_prestige_team: boolean
  home_is_wp_elite: boolean
  away_is_wp_elite: boolean
  /** Fixtures `is_prestige` cell when present; null if column missing. */
  is_prestige_sheet: boolean | null
  is_prestige_effective: boolean
  status: 'upcoming' | 'completed'
  verification_status: 'draft' | 'needs_review' | 'verified' | 'rejected'
  source: string
  dedupe_key: string
  /** Stable identity: `date` + canonical home + away (see `buildStableSheetFixtureKey`). */
  sheet_fixture_key: string
  /** @deprecated Optional CSV column; sync always writes `sheet_fixture_key` to DB `fixture_key`. */
  fixture_key: string | null
  /** Only set when Fixtures CSV has a province_group column (trimmed cell; empty → null). */
  province_group_sheet?: string | null
}

/** Loaded `game_matches` row fields needed for sheet sync matching and in-place updates. */
type ExistingGameMatchSyncRow = {
  id: string
  kickoff_time: string
  home_team: string
  away_team: string
  status: string
  verification_status: string | null
  admin_notes: string | null
  fixture_key: string | null
  province_group: string | null
  league_group: string | null
}

function buildLinkContext(row: NormalizedSheetRow) {
  const eff = effectiveGroupFieldsForMatchRow(row.league_group, '', '', false)
  const linkInput: FixtureGroupLinkInput = {
    leagueForDb: eff.leagueForDb,
    legacyProvinceGroupForDb: eff.legacyProvinceGroupForDb,
    tournamentForDb: eff.tournamentForDb,
    homeTeamProvince: row.home_team_province || null,
    awayTeamProvince: row.away_team_province || null,
    linkPrestigePool: row.is_prestige_effective,
    linkInterprovincialPool: row.is_interprovincial,
    linkWpElitePool: row.has_wp_elite_team,
  }
  const warnEff: GroupLinkWarningEffective = {
    leagueForDb: eff.leagueForDb,
    legacyProvinceGroupForDb: eff.legacyProvinceGroupForDb,
    tournamentForDb: eff.tournamentForDb,
    linkPrestigePool: row.is_prestige_effective,
    linkInterprovincialPool: row.is_interprovincial,
    linkWpElitePool: row.has_wp_elite_team,
  }
  const sheetWarn: SheetClassificationForWarnings = {
    league: row.league_group,
    legacyProvince: '',
    tournament: '',
    homeTeamProvince: row.home_team_province,
    awayTeamProvince: row.away_team_province,
    isPrestigeMatchExplicit: row.is_prestige_sheet,
  }
  return { eff, linkInput, warnEff, sheetWarn }
}

function normalizeVerification(v: string): 'draft' | 'needs_review' | 'verified' | 'rejected' {
  const s = v.trim().toLowerCase()
  if (s === 'draft' || s === 'needs_review' || s === 'verified' || s === 'rejected') return s
  return 'verified'
}

function toNumOrNull(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function orderedPairKey(a: string, b: string): string {
  return [a.trim().toLowerCase(), b.trim().toLowerCase()].sort().join('|')
}

/**
 * Normalized key for `game_matches_unique_pair` (production) and the verified pair index:
 * `kickoff_time` plus unordered `lower(trim)` home/away (same as `least`/`greatest` pair columns).
 */
function uniqueKickoffPairKey(kickoff: string, home: string, away: string): string {
  const ko = String(kickoff ?? '').trim()
  if (!ko) return ''
  return `${ko}|${orderedPairKey(home, away)}`
}

function uniqueKickoffPairKeyFromPayload(payload: Record<string, unknown>): string {
  return uniqueKickoffPairKey(
    String(payload.kickoff_time ?? ''),
    String(payload.home_team ?? ''),
    String(payload.away_team ?? '')
  )
}

function gameMatchStatusRank(status: string): number {
  const s = status.trim().toLowerCase()
  if (s === 'upcoming') return 4
  if (s === 'locked') return 3
  if (s === 'completed') return 2
  if (s === 'cancelled' || s === 'canceled') return 1
  return 0
}

/** When two DB rows collide on the same lookup key, prefer the row sync should update (usually upcoming). */
function pickPreferredExistingGmRow(
  a: ExistingGameMatchSyncRow,
  b: ExistingGameMatchSyncRow
): ExistingGameMatchSyncRow {
  const ra = gameMatchStatusRank(a.status)
  const rb = gameMatchStatusRank(b.status)
  if (ra !== rb) return ra > rb ? a : b
  return a.id.localeCompare(b.id) <= 0 ? a : b
}

function resolveExistingBySheetFixtureKey(
  row: NormalizedSheetRow,
  byNorm: Map<string, ExistingGameMatchSyncRow>
): ExistingGameMatchSyncRow | null {
  return byNorm.get(normalizeStableFixtureKeyForLookup(row.sheet_fixture_key)) ?? null
}

function provinceGroupForUpsert(
  row: NormalizedSheetRow,
  existing: ExistingGameMatchSyncRow | null
): string | null {
  if ('province_group_sheet' in row) {
    const t = (row.province_group_sheet ?? '').trim()
    return t ? t : null
  }
  return existing?.province_group ?? null
}

function leagueGroupForUpsert(row: NormalizedSheetRow, existing: ExistingGameMatchSyncRow | null): string | null {
  const raw = row.league_group.trim()
  if (raw) {
    const n = normalizeLeagueGroupForGameMatches(raw)
    return n ? n : null
  }
  return existing?.league_group ?? null
}

type GmInsertWorkItem = {
  pairOnDate: string
  kind: 'upcoming' | 'completed'
  body: Record<string, unknown>
}

type GmUpdateWorkItem = {
  pairOnDate: string
  kind: 'upcoming' | 'completed'
  id: string
  reactivate: boolean
  body: Record<string, unknown>
  prevAdminNotes: string | null
}

type MatchRowUpdatePlan = {
  id: number
  team_a_score: number
  team_b_score: number
  season: number
}

type MatchRowInsertPlan = {
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
  match_date: string
  season: number
}

type SyncWritePlan = {
  gmInserts: GmInsertWorkItem[]
  gmUpdates: GmUpdateWorkItem[]
  matchRowUpdates: MatchRowUpdatePlan[]
  matchRowInserts: MatchRowInsertPlan[]
  skippedDuplicates: number
  skippedUpdatesDueToVerifiedPair: number
  skippedInsertsDueToVerifiedPair: number
  skippedUpdatesDueToKickoffPairConflict: number
  skippedInsertsDueToKickoffPairConflict: number
  skippedUpdatesDueToFixtureKeyConflict: number
  skippedInsertsDueToFixtureKeyConflict: number
  wouldLinkGroupRows: number
  groupLinkWarningAdds: number
  errors: string[]
  warnings: string[]
}

type PrepareSyncPlanContext = {
  teamRegistry: SheetTeamsRegistry
  syncTeams: TeamRow[]
  syncTeamAliasMap: Map<string, string>
  fixtureGroupMaps: FixtureGroupMaps
  fixturesCsvUrl: string
  existingByFixtureKey: Map<string, ExistingGameMatchSyncRow>
  uniqueVerifiedTripletToId: Map<string, string>
  gameMatchById: Map<string, ExistingGameMatchSyncRow>
  existingMatchesByDate: Map<string, Array<{ id: number; team_a_id: number; team_b_id: number }>>
  completedTeamIdCache: Map<string, number>
}

function mergeGmRowAfterUpdate(
  u: GmUpdateWorkItem,
  payload: Record<string, unknown>,
  oldGm: ExistingGameMatchSyncRow | undefined
): ExistingGameMatchSyncRow {
  const b = payload
  return {
    id: u.id,
    kickoff_time: String(b.kickoff_time ?? ''),
    home_team: String(b.home_team ?? ''),
    away_team: String(b.away_team ?? ''),
    status: u.kind === 'completed' ? 'completed' : 'upcoming',
    verification_status: typeof b.verification_status === 'string' ? b.verification_status : 'verified',
    admin_notes: u.prevAdminNotes ?? oldGm?.admin_notes ?? null,
    fixture_key: typeof b.fixture_key === 'string' ? b.fixture_key : (oldGm?.fixture_key ?? null),
    province_group: typeof b.province_group === 'string' ? b.province_group : (oldGm?.province_group ?? null),
    league_group: typeof b.league_group === 'string' ? b.league_group : (oldGm?.league_group ?? null),
  }
}

function applySimulatedGmUpdate(
  u: GmUpdateWorkItem,
  payload: Record<string, unknown>,
  simTriplet: Map<string, string>,
  simGmById: Map<string, ExistingGameMatchSyncRow>,
  simKickoffPair: Map<string, string>,
  simFixtureNorm: Map<string, string>
): void {
  const oldGm = simGmById.get(u.id)
  const oldUk = oldGm
    ? verifiedUniqueTripletKey(oldGm.kickoff_time, oldGm.home_team, oldGm.away_team, oldGm.verification_status)
    : null
  if (oldUk && simTriplet.get(oldUk) === u.id) {
    simTriplet.delete(oldUk)
  }
  const oldFk = oldGm?.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(oldGm.fixture_key.trim()) : ''
  if (oldFk && simFixtureNorm.get(oldFk) === u.id) {
    simFixtureNorm.delete(oldFk)
  }
  const next = mergeGmRowAfterUpdate(u, payload, oldGm)
  simGmById.set(u.id, next)
  const newUk = verifiedUniqueTripletKeyFromPayload(payload)
  if (newUk) {
    simTriplet.set(newUk, u.id)
  }
  const newPk = uniqueKickoffPairKey(next.kickoff_time, next.home_team, next.away_team)
  if (newPk) {
    simKickoffPair.set(newPk, u.id)
  }
  const fkRaw = typeof payload.fixture_key === 'string' ? payload.fixture_key.trim() : ''
  const newFn = fkRaw ? normalizeStableFixtureKeyForLookup(fkRaw) : ''
  if (newFn) {
    simFixtureNorm.set(newFn, u.id)
  }
}

function prepareSyncPlan(
  rows: NormalizedSheetRow[],
  _mode: 'dry_run' | 'run',
  ctx: PrepareSyncPlanContext
): SyncWritePlan {
  const planErrors: string[] = []
  const planWarnings: string[] = []
  let wouldLinkGroupRows = 0
  let groupLinkWarningAdds = 0

  let gmInserts: GmInsertWorkItem[] = []
  const gmUpdates: GmUpdateWorkItem[] = []
  const matchRowUpdates: MatchRowUpdatePlan[] = []
  const matchRowInserts: MatchRowInsertPlan[] = []

  for (const row of rows) {
    const trackKey = normalizeStableFixtureKeyForLookup(row.sheet_fixture_key)
    if (row.status === 'upcoming') {
      const { linkInput, warnEff, sheetWarn } = buildLinkContext(row)
      const linkIds = computeFixtureGroupLinkIds(ctx.fixtureGroupMaps, linkInput)
      if (linkIds.length > 0) wouldLinkGroupRows += 1
      const rowLabelUp = `${row.home_team} vs ${row.away_team}`
      const warnUp = collectGroupLinkResolutionWarnings(ctx.fixtureGroupMaps, warnEff, sheetWarn, rowLabelUp)
      groupLinkWarningAdds += warnUp.messages.length
      for (const w of warnUp.messages) planErrors.push(w)

      const existingGmUp = resolveExistingBySheetFixtureKey(row, ctx.existingByFixtureKey)
      const upLeague = leagueGroupForUpsert(row, existingGmUp ?? null)
      const upHomeTeamProv = normalizeProvinceLabelForGameMatches(row.home_team_province.trim())
      const upAwayTeamProv = normalizeProvinceLabelForGameMatches(row.away_team_province.trim())
      if (existingGmUp?.id) {
        const body: Record<string, unknown> = {
          kickoff_time: row.kickoff_time,
          home_team: row.home_team,
          away_team: row.away_team,
          fixture_key: row.sheet_fixture_key,
          province_group: provinceGroupForUpsert(row, existingGmUp),
          league_group: upLeague,
          tournament: null,
          home_team_province: upHomeTeamProv ? upHomeTeamProv : null,
          away_team_province: upAwayTeamProv ? upAwayTeamProv : null,
          is_interprovincial: row.is_interprovincial,
          has_wp_elite_team: row.has_wp_elite_team,
          home_is_prestige_team: row.home_is_prestige_team,
          away_is_prestige_team: row.away_is_prestige_team,
          home_is_wp_elite: row.home_is_wp_elite,
          away_is_wp_elite: row.away_is_wp_elite,
          is_prestige_match: row.is_prestige_sheet,
          is_prestige: !!row.is_prestige_effective,
          status: row.status,
          verification_status: 'verified',
          source_name: row.source || 'Google Sheet (Teams + Fixtures)',
          source_url: ctx.fixturesCsvUrl,
          source_type: 'google_sheet_teams_fixtures',
          rejected_reason: null,
        }
        const bad = payloadForbiddenKeys(body)
        if (bad.length) {
          planErrors.push(`game_matches update payload must not include: ${bad.join(', ')}`)
        } else {
          gmUpdates.push({
            pairOnDate: trackKey,
            kind: 'upcoming',
            id: existingGmUp.id,
            reactivate: existingGmUp.status === 'rejected' || existingGmUp.verification_status === 'rejected',
            prevAdminNotes: existingGmUp.admin_notes,
            body,
          })
        }
      } else {
        const body: Record<string, unknown> = {
          home_team: row.home_team,
          away_team: row.away_team,
          kickoff_time: row.kickoff_time,
          status: row.status,
          verification_status: 'verified',
          fixture_key: row.sheet_fixture_key,
          province_group: provinceGroupForUpsert(row, null),
          league_group: leagueGroupForUpsert(row, null),
          tournament: null,
          home_team_province: upHomeTeamProv ? upHomeTeamProv : null,
          away_team_province: upAwayTeamProv ? upAwayTeamProv : null,
          is_interprovincial: row.is_interprovincial,
          has_wp_elite_team: row.has_wp_elite_team,
          home_is_prestige_team: row.home_is_prestige_team,
          away_is_prestige_team: row.away_is_prestige_team,
          home_is_wp_elite: row.home_is_wp_elite,
          away_is_wp_elite: row.away_is_wp_elite,
          is_prestige_match: row.is_prestige_sheet,
          is_prestige: !!row.is_prestige_effective,
          source_name: row.source || 'Google Sheet (Teams + Fixtures)',
          source_url: ctx.fixturesCsvUrl,
          source_type: 'google_sheet_teams_fixtures',
        }
        const bad = payloadForbiddenKeys(body)
        if (bad.length) {
          planErrors.push(`game_matches insert payload must not include: ${bad.join(', ')}`)
        } else {
          gmInserts.push({ pairOnDate: trackKey, kind: 'upcoming', body })
        }
      }
      continue
    }

    if (row.status !== 'completed') continue

    const homeTeamId = ctx.completedTeamIdCache.get(teamLookupNormalize(row.home_team))
    const awayTeamId = ctx.completedTeamIdCache.get(teamLookupNormalize(row.away_team))
    if (homeTeamId === undefined || awayTeamId === undefined) {
      planErrors.push(`Completed row team id missing after batch resolve (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (homeTeamId === awayTeamId) {
      planErrors.push(`Completed row resolved to same team id (${row.home_team} vs ${row.away_team})`)
      continue
    }
    if (row.home_score == null || row.away_score == null) {
      planErrors.push(`Completed row missing score (${row.home_team} vs ${row.away_team})`)
      continue
    }

    const existingGmCompleted = resolveExistingBySheetFixtureKey(row, ctx.existingByFixtureKey)
    const dbLeague = leagueGroupForUpsert(row, existingGmCompleted)
    const dbHomeTeamProv = normalizeProvinceLabelForGameMatches(row.home_team_province.trim())
    const dbAwayTeamProv = normalizeProvinceLabelForGameMatches(row.away_team_province.trim())

    const existingForDate = ctx.existingMatchesByDate.get(row.match_date) ?? []
    const duplicateMatch = existingForDate.find((m) => {
      const a = m.team_a_id
      const b = m.team_b_id
      return (a === homeTeamId && b === awayTeamId) || (a === awayTeamId && b === homeTeamId)
    })
    if (duplicateMatch) {
      matchRowUpdates.push({
        id: duplicateMatch.id,
        team_a_score: row.home_score,
        team_b_score: row.away_score,
        season: Number(row.match_date.slice(0, 4)),
      })
    } else {
      matchRowInserts.push({
        team_a_id: homeTeamId,
        team_b_id: awayTeamId,
        team_a_score: row.home_score,
        team_b_score: row.away_score,
        match_date: row.match_date,
        season: Number(row.match_date.slice(0, 4)),
      })
    }

    const gmCompletedBody: Record<string, unknown> = {
      kickoff_time: row.kickoff_time,
      home_team: row.home_team,
      away_team: row.away_team,
      status: 'completed',
      home_score: row.home_score,
      away_score: row.away_score,
      verification_status: 'verified',
      fixture_key: row.sheet_fixture_key,
      province_group: provinceGroupForUpsert(row, existingGmCompleted),
      league_group: dbLeague,
      tournament: null,
      home_team_province: dbHomeTeamProv ? dbHomeTeamProv : null,
      away_team_province: dbAwayTeamProv ? dbAwayTeamProv : null,
      is_interprovincial: row.is_interprovincial,
      has_wp_elite_team: row.has_wp_elite_team,
      home_is_prestige_team: row.home_is_prestige_team,
      away_is_prestige_team: row.away_is_prestige_team,
      home_is_wp_elite: row.home_is_wp_elite,
      away_is_wp_elite: row.away_is_wp_elite,
      is_prestige_match: row.is_prestige_sheet,
      is_prestige: !!row.is_prestige_effective,
      rejected_reason: null,
      source_name: row.source || 'Google Sheet (Teams + Fixtures)',
      source_url: ctx.fixturesCsvUrl,
      source_type: 'google_sheet_teams_fixtures',
    }
    const badGm = payloadForbiddenKeys(gmCompletedBody)
    if (badGm.length) {
      planErrors.push(`game_matches insert/update payload must not include: ${badGm.join(', ')}`)
      continue
    }
    if (existingGmCompleted) {
      gmUpdates.push({
        pairOnDate: trackKey,
        kind: 'completed',
        id: existingGmCompleted.id,
        reactivate: false,
        prevAdminNotes: existingGmCompleted.admin_notes,
        body: gmCompletedBody,
      })
    } else {
      gmInserts.push({ pairOnDate: trackKey, kind: 'completed', body: gmCompletedBody })
    }

    const { warnEff, sheetWarn } = buildLinkContext(row)
    const rowLabelC = `${row.home_team} vs ${row.away_team}`
    const warnC = collectGroupLinkResolutionWarnings(ctx.fixtureGroupMaps, warnEff, sheetWarn, rowLabelC)
    groupLinkWarningAdds += warnC.messages.length
    for (const w of warnC.messages) planErrors.push(w)
  }

  const { inserts: finalizedInserts, skippedSheetBatchDedupes } = finalizeGameMatchInsertsWithCount(
    gmInserts,
    gmUpdates,
    ctx.existingByFixtureKey
  )

  for (const r of matchRowUpdates) {
    const writeBody: Record<string, unknown> = {
      team_a_score: r.team_a_score,
      team_b_score: r.team_b_score,
      season: r.season,
    }
    const bad = payloadForbiddenKeys(writeBody)
    if (bad.length) {
      planErrors.push(`matches update write body must not include: ${bad.join(', ')}`)
    }
  }
  for (const r of matchRowInserts) {
    const writeBody: Record<string, unknown> = {
      team_a_id: r.team_a_id,
      team_b_id: r.team_b_id,
      team_a_score: r.team_a_score,
      team_b_score: r.team_b_score,
      match_date: r.match_date,
      season: r.season,
    }
    const bad = payloadForbiddenKeys(writeBody)
    if (bad.length) {
      planErrors.push(`matches insert write body must not include: ${bad.join(', ')}`)
    }
  }

  const simTriplet = new Map(ctx.uniqueVerifiedTripletToId)
  const simGmById = new Map(ctx.gameMatchById)
  const simKickoffPair = buildKickoffPairOccupantMap(simGmById)
  const simFixtureNorm = buildFixtureNormOccupantMap(simGmById)

  const finalGmUpdates: GmUpdateWorkItem[] = []
  let skippedUpdatesDueToVerifiedPair = 0
  let skippedUpdatesDueToKickoffPairConflict = 0
  let skippedUpdatesDueToFixtureKeyConflict = 0
  for (const u of gmUpdates) {
    const rawBody = u.body as Record<string, unknown>
    const payload = stripForbiddenWritePayload(rawBody)
    const oldGm = simGmById.get(u.id)
    const oldFn = oldGm?.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(oldGm.fixture_key.trim()) : ''
    const newFn =
      typeof payload.fixture_key === 'string' && payload.fixture_key.trim()
        ? normalizeStableFixtureKeyForLookup(String(payload.fixture_key))
        : ''

    if (oldFn && oldFn !== newFn && simFixtureNorm.get(oldFn) === u.id) {
      simFixtureNorm.delete(oldFn)
    }
    const fixtureOcc = newFn ? simFixtureNorm.get(newFn) : undefined
    if (newFn && fixtureOcc && fixtureOcc !== u.id) {
      if (oldFn && oldFn !== newFn) simFixtureNorm.set(oldFn, u.id)
      planWarnings.push(
        `Warning: Skipped game_matches update (fixture_key already used by another row). currentId=${u.id} conflictId=${fixtureOcc} fixture_key=${JSON.stringify(String(payload.fixture_key ?? ''))}.`
      )
      skippedUpdatesDueToFixtureKeyConflict += 1
      continue
    }

    const oldPk = oldGm ? uniqueKickoffPairKey(oldGm.kickoff_time, oldGm.home_team, oldGm.away_team) : ''
    const newPk = uniqueKickoffPairKeyFromPayload(payload)

    if (oldPk && oldPk !== newPk && simKickoffPair.get(oldPk) === u.id) {
      simKickoffPair.delete(oldPk)
    }

    const pairOccupant = newPk ? simKickoffPair.get(newPk) : undefined
    if (newPk && pairOccupant && pairOccupant !== u.id) {
      if (oldPk && oldPk !== newPk) simKickoffPair.set(oldPk, u.id)
      if (oldFn && oldFn !== newFn) simFixtureNorm.set(oldFn, u.id)
      planWarnings.push(formatGmUpdateSkippedUniquePairWarning(u.id, pairOccupant, payload))
      skippedUpdatesDueToKickoffPairConflict += 1
      continue
    }

    const conflictId = findConflictingGameMatch(payload, u.id, simTriplet)
    if (conflictId) {
      if (oldPk && oldPk !== newPk) simKickoffPair.set(oldPk, u.id)
      if (oldFn && oldFn !== newFn) simFixtureNorm.set(oldFn, u.id)
      planWarnings.push(
        `Warning: Skipped game_matches update (verified kickoff triplet conflict). currentId=${u.id} conflictId=${conflictId} home_team=${JSON.stringify(String(payload.home_team ?? ''))} away_team=${JSON.stringify(String(payload.away_team ?? ''))} kickoff_time=${JSON.stringify(String(payload.kickoff_time ?? ''))}.`
      )
      skippedUpdatesDueToVerifiedPair += 1
      continue
    }
    applySimulatedGmUpdate(u, payload, simTriplet, simGmById, simKickoffPair, simFixtureNorm)
    finalGmUpdates.push(u)
  }

  const finalGmInserts: GmInsertWorkItem[] = []
  let skippedInsertsDueToVerifiedPair = 0
  let skippedInsertsDueToKickoffPairConflict = 0
  let skippedInsertsDueToFixtureKeyConflict = 0
  let pendingSlot = 0
  for (const ins of finalizedInserts) {
    const rawBody = ins.body as Record<string, unknown>
    const payload = stripForbiddenWritePayload(rawBody)
    const fn =
      typeof payload.fixture_key === 'string' && payload.fixture_key.trim()
        ? normalizeStableFixtureKeyForLookup(String(payload.fixture_key))
        : ''
    if (fn && simFixtureNorm.get(fn)) {
      const occ = simFixtureNorm.get(fn)!
      planWarnings.push(
        `Warning: Skipped game_matches insert (fixture_key already exists). conflictId=${occ} fixture_key=${JSON.stringify(String(payload.fixture_key ?? ''))}.`
      )
      skippedInsertsDueToFixtureKeyConflict += 1
      continue
    }
    const pk = uniqueKickoffPairKeyFromPayload(payload)
    if (pk && simKickoffPair.get(pk)) {
      const occPair = simKickoffPair.get(pk)!
      planWarnings.push(formatGmInsertSkippedUniquePairWarning(occPair, payload))
      skippedInsertsDueToKickoffPairConflict += 1
      continue
    }
    const k = verifiedUniqueTripletKeyFromPayload(payload)
    if (k) {
      const occ = simTriplet.get(k)
      if (occ) {
        planWarnings.push(
          'Warning: Skipped insert because another verified fixture already exists for same kickoff/team pair.'
        )
        skippedInsertsDueToVerifiedPair += 1
        continue
      }
    }
    const pend = `__pending_ins_${pendingSlot}`
    if (k) simTriplet.set(k, pend)
    if (pk) simKickoffPair.set(pk, pend)
    if (fn) simFixtureNorm.set(fn, pend)
    if (k || pk || fn) pendingSlot += 1
    finalGmInserts.push(ins)
  }

  return {
    gmInserts: finalGmInserts,
    gmUpdates: finalGmUpdates,
    matchRowUpdates,
    matchRowInserts,
    skippedDuplicates: skippedSheetBatchDedupes,
    skippedUpdatesDueToVerifiedPair,
    skippedInsertsDueToVerifiedPair,
    skippedUpdatesDueToKickoffPairConflict,
    skippedInsertsDueToKickoffPairConflict,
    skippedUpdatesDueToFixtureKeyConflict,
    skippedInsertsDueToFixtureKeyConflict,
    wouldLinkGroupRows,
    groupLinkWarningAdds,
    errors: planErrors,
    warnings: planWarnings,
  }
}

function sheetFixtureNormFromBody(body: Record<string, unknown>): string {
  const raw = typeof body.fixture_key === 'string' ? body.fixture_key.trim() : ''
  return raw ? normalizeStableFixtureKeyForLookup(raw) : ''
}

/**
 * Dedupe insert batch by stable `fixture_key` (last row wins), then promote to update when DB already has that key.
 */
function finalizeGameMatchInsertsWithCount(
  inserts: GmInsertWorkItem[],
  updatesOut: GmUpdateWorkItem[],
  fkMap: Map<string, ExistingGameMatchSyncRow>
): { inserts: GmInsertWorkItem[]; skippedSheetBatchDedupes: number } {
  let skippedSheetBatchDedupes = 0
  const lastWinByKey = new Map<string, GmInsertWorkItem>()
  for (const item of inserts) {
    const body = stripForbiddenWritePayload(item.body)
    const key = sheetFixtureNormFromBody(body)
    const dedupeKey = key || `__missing_fk__:${item.pairOnDate}`
    if (lastWinByKey.has(dedupeKey)) {
      skippedSheetBatchDedupes += 1
      console.info(`${SYNC_SHEET_LOG} skipped duplicate insert (sheet batch dedupe)`, { key: dedupeKey })
    }
    lastWinByKey.set(dedupeKey, item)
  }
  const out: GmInsertWorkItem[] = []
  for (const item of lastWinByKey.values()) {
    const body = stripForbiddenWritePayload(item.body)
    const kn = sheetFixtureNormFromBody(body)
    if (kn) {
      const existing = fkMap.get(kn)
      if (existing) {
        console.info(`${SYNC_SHEET_LOG} matched existing fixture by fixture_key`, { id: existing.id, kind: item.kind })
        updatesOut.push({
          pairOnDate: item.pairOnDate,
          kind: item.kind,
          id: existing.id,
          reactivate: existing.status === 'rejected' || existing.verification_status === 'rejected',
          prevAdminNotes: existing.admin_notes,
          body,
        })
        continue
      }
    }
    out.push({ ...item, body })
  }
  return { inserts: out, skippedSheetBatchDedupes }
}

/**
 * Teams-tab provinces → `game_matches.home_team_province` / `away_team_province`.
 * Short codes (FS, WP, …) must match `fixture_groups.name` so `trg_sync_game_match_groups_from_fields`
 * (after insert/update on `game_matches`) inserts canonical `game_match_groups` rows, not ad-hoc slug rows.
 */
function canonicalProvinceGroup(raw: string): { value: string | null; warning?: string } {
  const t = raw.trim()
  if (!t) return { value: null }
  return { value: normalizeProvinceLabelForGameMatches(t) }
}

export async function POST(request: Request) {
  const reqUrl = new URL(request.url)
  const dryRun = reqUrl.searchParams.get('dry_run') === '1'
  const replaceUpcoming = reqUrl.searchParams.get('replace_upcoming') === '1'
  const legacyFixtureKeyBackfill = reqUrl.searchParams.get('legacy_fixture_key_backfill') === '1'

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const fixturesCsvUrl = process.env.GOOGLE_SHEET_FIXTURES_CSV_URL ?? ''
  const teamsCsvUrl = process.env.GOOGLE_SHEET_TEAMS_CSV_URL ?? ''
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured for sheet sync' }, { status: 500 })
  }
  if (!fixturesCsvUrl) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_SHEET_FIXTURES_CSV_URL is required (Fixtures tab CSV export only — Master tab is not used)' },
      { status: 500 }
    )
  }
  if (!teamsCsvUrl) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_SHEET_TEAMS_CSV_URL is required (Teams tab export)' },
      { status: 500 }
    )
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabase, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const errors: string[] = []
  let skipped_duplicates = 0
  let inserted_upcoming = 0
  let updated_upcoming = 0
  let reactivated_upcoming = 0
  let rejected_old_upcoming = 0
  let inserted_completed = 0
  let updated_completed = 0
  let would_insert_upcoming = 0
  let would_update_upcoming = 0
  let would_reactivate_upcoming = 0
  let would_reject_old_upcoming = 0
  let would_insert_completed = 0
  let would_update_completed = 0
  let province_group_warnings = 0
  let would_link_groups = 0
  let linked_groups = 0
  let group_link_warnings = 0
  let matches_inserted = 0
  let matches_updated = 0
  let syncTimedOut = false
  let lastProcessedFixtureRow: string | undefined
  let fixture_key_backfilled = 0

  const [teamsCsvRes, fixturesCsvRes] = await Promise.all([fetch(teamsCsvUrl), fetch(fixturesCsvUrl)])
  if (!teamsCsvRes.ok) {
    return NextResponse.json({ ok: false, error: `Could not fetch Teams CSV (${teamsCsvRes.status})` }, { status: 400 })
  }
  if (!fixturesCsvRes.ok) {
    return NextResponse.json(
      { ok: false, error: `Could not fetch Fixtures CSV (${fixturesCsvRes.status})` },
      { status: 400 }
    )
  }
  const teamsCsvText = await teamsCsvRes.text()
  const fixturesCsvText = await fixturesCsvRes.text()
  const teamsParsed = parseTeamsSheetCsv(teamsCsvText)
  errors.push(...teamsParsed.errors)
  const teamRegistry = new SheetTeamsRegistry(teamsParsed.rows)
  let teamsRegistryDebug: TeamsRegistryDebug | undefined
  const unresolvedTeamsDebug: TeamsRegistryUnresolvedTeam[] = []
  const parsed = parseFixturesSheetCsv(fixturesCsvText)
  errors.push(...parsed.errors)
  if (!parsed.rows.length) {
    teamsRegistryDebug = dryRun
      ? buildTeamsRegistryDebug(teamRegistry, {
          teamsRowsCount: teamsParsed.rows.length,
          teamsCsvUrlUsedMasked: maskTeamsCsvUrl(teamsCsvUrl),
          firstFiveCanonicalNames: teamsParsed.rows
            .slice(0, 5)
            .map((r) => (r.canonical_name || r.team_name).trim()),
          unresolvedTeams: [],
        })
      : undefined
    const validation_errors = errors.length ? errors : ['No rows found in CSV']
    const emptySummary: SyncSummary = {
      mode: dryRun ? 'dry_run' : 'run',
      replace_upcoming: replaceUpcoming,
      incoming_rows: 0,
      would_insert_upcoming: 0,
      would_update_upcoming: 0,
      would_reactivate_upcoming: 0,
      would_reject_old_upcoming: 0,
      would_insert_completed: 0,
      would_update_completed: 0,
      would_insert_completed_game_matches: 0,
      would_update_completed_game_matches: 0,
      inserted_upcoming: 0,
      updated_upcoming: 0,
      reactivated_upcoming: 0,
      rejected_old_upcoming: 0,
      inserted_completed: 0,
      updated_completed: 0,
      skipped_duplicates: 0,
      province_group_warnings: 0,
      would_link_groups: 0,
      linked_groups: 0,
      group_link_warnings: 0,
      completed_matches_scored: 0,
      post_sync_sweep_scored: 0,
      post_sync_sweep_attempted: 0,
      group_link_repair_examined: 0,
      group_link_repair_linked: 0,
      group_link_failures: 0,
      skipped_group_linking_count: 0,
      game_matches_inserted: 0,
      game_matches_updated: 0,
      matches_inserted: 0,
      matches_updated: 0,
      sync_import_notice: dryRun ? undefined : SYNC_IMPORT_FOLLOWUP_NOTICE,
      validation_errors,
      warnings: buildStructuredWarningsFromStrings(validation_errors),
      ...(teamsRegistryDebug ? { teams_registry_debug: teamsRegistryDebug } : {}),
    }
    await supabase.from('sync_runs').insert({
      mode: dryRun ? 'dry_run' : 'run',
      replace_upcoming: replaceUpcoming,
      incoming_rows: 0,
      inserted_upcoming: 0,
      updated_upcoming: 0,
      reactivated_upcoming: 0,
      rejected_old_upcoming: 0,
      inserted_completed: 0,
      updated_completed: 0,
      skipped_duplicates: 0,
      province_group_warnings: 0,
      would_link_groups: 0,
      linked_groups: 0,
      group_link_warnings: 0,
      validation_errors: emptySummary.validation_errors,
      summary: emptySummary,
    })
    return NextResponse.json({ ok: false, ...emptySummary })
  }

  const normalized: NormalizedSheetRow[] = []

  if (!dryRun) {
    await upsertTeamsAndAliasesFromTeamsSheet(supabase, teamsParsed.rows, errors)
  }

  const { data: teamsDataForSync, error: teamsErrForSync } = await supabase
    .from('teams')
    .select('id, name, canonical_name')
  if (teamsErrForSync) {
    return NextResponse.json({ ok: false, error: `Could not load teams: ${teamsErrForSync.message}` }, { status: 500 })
  }
  const teams = (teamsDataForSync as TeamRow[] | null) ?? []
  const { data: teamAliasRowsForSync } = await supabase.from('team_aliases').select('*')
  const sheetSyncAliasMap = buildSheetSyncAliasMap(
    teamsParsed.rows,
    (teamAliasRowsForSync as TeamAliasDbRow[]) ?? [],
    teams
  )

  const seen = new Set<string>()
  const stableFixtureRepeatCounts = new Map<string, number>()
  const teamDateDupMap = new Map<string, { teamLabel: string; matchDate: string; rows: TeamDateDupAppearance[] }>()
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const r = parsed.rows[i]
    const date = normalizeDate(r.date)
    const timeNorm = normalizeTime(r.time)
    const rawHome = r.home_team.trim()
    const rawAway = r.away_team.trim()
    if (!date) {
      errors.push(`Row ${i + 2}: missing or invalid date`)
      continue
    }
    if (!timeNorm) {
      errors.push(`Row ${i + 2}: missing or invalid time`)
      continue
    }
    if (!rawHome || !rawAway) {
      errors.push(`Row ${i + 2}: missing home_team or away_team`)
      continue
    }
    const hr = teamRegistry.resolve(rawHome)
    const ar = teamRegistry.resolve(rawAway)
    if (dryRun && !hr.ok) {
      unresolvedTeamsDebug.push({
        fixture_sheet_row: i + 2,
        side: 'home',
        raw_team_value: rawHome,
        normalized_team_key: teamLookupNormalize(rawHome),
        similar_lookup_keys: teamRegistry.findSimilarLookupKeys(rawHome, 10),
      })
    }
    if (dryRun && !ar.ok) {
      unresolvedTeamsDebug.push({
        fixture_sheet_row: i + 2,
        side: 'away',
        raw_team_value: rawAway,
        normalized_team_key: teamLookupNormalize(rawAway),
        similar_lookup_keys: teamRegistry.findSimilarLookupKeys(rawAway, 10),
      })
    }
    if (!hr.ok) {
      const nk = teamLookupNormalize(rawHome)
      const similar = teamRegistry.findSimilarLookupKeys(rawHome, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched home_team raw=${JSON.stringify(rawHome)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }
    if (!ar.ok) {
      const nk = teamLookupNormalize(rawAway)
      const similar = teamRegistry.findSimilarLookupKeys(rawAway, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched away_team raw=${JSON.stringify(rawAway)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }

    if (!hr.ok || !ar.ok) {
      continue
    }

    const homeDb = canonicalTeamLabelForGameMatches(rawHome, teamRegistry, teams, sheetSyncAliasMap)
    const awayDb = canonicalTeamLabelForGameMatches(rawAway, teamRegistry, teams, sheetSyncAliasMap)

    const sheet_fixture_key = buildStableSheetFixtureKey(date, homeDb, awayDb)
    const dedupe = normalizeStableFixtureKeyForLookup(sheet_fixture_key)
    stableFixtureRepeatCounts.set(dedupe, (stableFixtureRepeatCounts.get(dedupe) ?? 0) + 1)

    if (homeDb.toLowerCase() === awayDb.toLowerCase()) {
      errors.push(`Row ${i + 2}: home and away resolve to the same canonical team`)
      continue
    }

    const sheetRowNum = i + 2
    recordTeamDateDup(teamDateDupMap, homeDb, date, sheetRowNum, homeDb, awayDb)
    recordTeamDateDup(teamDateDupMap, awayDb, date, sheetRowNum, homeDb, awayDb)

    if (seen.has(dedupe)) {
      skipped_duplicates += 1
      continue
    }
    seen.add(dedupe)

    const hpRaw = (hr.team.province ?? '').trim()
    const apRaw = (ar.team.province ?? '').trim()
    const homeProv = canonicalProvinceGroup(hpRaw)
    const awayProv = canonicalProvinceGroup(apRaw)
    if (homeProv.warning) {
      province_group_warnings += 1
      errors.push(`Warning row ${i + 2} home province: ${homeProv.warning}`)
    }
    if (awayProv.warning) {
      province_group_warnings += 1
      errors.push(`Warning row ${i + 2} away province: ${awayProv.warning}`)
    }

    const hs = toNumOrNull(r.home_score)
    const as = toNumOrNull(r.away_score)
    const hasBothScores = hs != null && as != null
    const status: 'upcoming' | 'completed' = hasBothScores ? 'completed' : 'upcoming'
    const sheetStatus = normalizeGameMatchStatus(r.status)
    if (hasBothScores && sheetStatus !== 'completed') {
      errors.push(
        `Warning row ${i + 2}: both scores present — status forced to completed (sheet had "${r.status.trim()}")`
      )
    }
    if (!hasBothScores && sheetStatus === 'completed') {
      errors.push(
        `Warning row ${i + 2}: sheet status completed but scores incomplete — using upcoming`
      )
    }

    const isPrestigeSheet: boolean | null = r.is_prestige.trim() === '' ? null : parseBool(r.is_prestige)
    const homePrestigeT = hr.team.isPrestigeTeam
    const awayPrestigeT = ar.team.isPrestigeTeam
    const isPrestigeEffective = (isPrestigeSheet === true) || homePrestigeT || awayPrestigeT
    const homeWp = hr.team.isWpElite
    const awayWp = ar.team.isWpElite
    const hp = homeProv.value ?? ''
    const ap = awayProv.value ?? ''
    const inter = shouldPersistInterprovincial(hp, ap)

    normalized.push({
      kickoff_time: toSastKickoffIso(date, timeNorm),
      match_date: date,
      home_team: homeDb,
      away_team: awayDb,
      home_score: hs,
      away_score: as,
      league_group: normalizeLeagueGroupForGameMatches(r.league_group.trim()),
      home_team_province: hp,
      away_team_province: ap,
      is_interprovincial: inter,
      has_wp_elite_team: homeWp || awayWp,
      home_is_prestige_team: homePrestigeT,
      away_is_prestige_team: awayPrestigeT,
      home_is_wp_elite: homeWp,
      away_is_wp_elite: awayWp,
      is_prestige_sheet: isPrestigeSheet,
      is_prestige_effective: isPrestigeEffective,
      status,
      verification_status: normalizeVerification(r.verification_status),
      source: r.source.trim(),
      dedupe_key: dedupe,
      sheet_fixture_key,
      fixture_key: sheet_fixture_key,
      ...(r.province_group !== undefined
        ? { province_group_sheet: r.province_group.trim() ? r.province_group.trim() : null }
        : {}),
    })
  }

  let hasCriticalTeamDateDuplicates = false
  for (const b of teamDateDupMap.values()) {
    if (b.rows.length <= 1) continue
    hasCriticalTeamDateDuplicates = true
    const parts = b.rows.map((r) => `row ${r.sheet_row}: ${r.home_team} vs ${r.away_team}`).join('; ')
    errors.push(
      `Critical: team-date duplicate — team ${JSON.stringify(b.teamLabel)} on ${b.matchDate} appears in ${b.rows.length} fixtures: ${parts}`
    )
  }

  teamsRegistryDebug = dryRun
    ? buildTeamsRegistryDebug(teamRegistry, {
        teamsRowsCount: teamsParsed.rows.length,
        teamsCsvUrlUsedMasked: maskTeamsCsvUrl(teamsCsvUrl),
        firstFiveCanonicalNames: teamsParsed.rows
          .slice(0, 5)
          .map((r) => (r.canonical_name || r.team_name).trim()),
        unresolvedTeams: unresolvedTeamsDebug,
        completedUsedRegistryCanonical: normalized.some((r) => r.status === 'completed'),
      })
    : undefined

  for (const [stableNorm, count] of stableFixtureRepeatCounts.entries()) {
    if (count > 1) {
      errors.push(
        `Warning: duplicate fixture in sheet — same stable fixture_key (${count} rows) after normalize: ${stableNorm}`
      )
    }
  }

  const sheetCompletedFixtureNorms = new Set<string>()
  const sheetUpcomingFixtureNorms = new Set<string>()
  for (const row of normalized) {
    const n = normalizeStableFixtureKeyForLookup(row.sheet_fixture_key)
    if (row.status === 'completed') sheetCompletedFixtureNorms.add(n)
    else sheetUpcomingFixtureNorms.add(n)
  }

  let fixtureGroupMaps: FixtureGroupMaps = await loadFixtureGroupMaps(supabase)

  /** Existing rows indexed by normalized `fixture_key` (sheet-driven sync). */
  const { data: existingGameMatchesData, error: existingGameMatchesErr } = await supabase
    .from('game_matches')
    .select(
      'id, kickoff_time, home_team, away_team, status, verification_status, admin_notes, fixture_key, province_group, league_group'
    )
  if (existingGameMatchesErr) {
    return NextResponse.json({ ok: false, error: `Could not load existing game matches: ${existingGameMatchesErr.message}` }, { status: 500 })
  }

  const existingByFixtureKey = new Map<string, ExistingGameMatchSyncRow>()
  const existingCurrentUpcomingIdsByFixtureNorm = new Map<string, string>()
  const gameMatchById = new Map<string, ExistingGameMatchSyncRow>()
  /** Matches partial unique index `game_matches_verified_kickoff_pair_uidx` (verified-only). */
  const uniqueVerifiedTripletToId = new Map<string, string>()

  for (const row of (existingGameMatchesData as ExistingGameMatchSyncRow[] | null) ?? []) {
    const gm: ExistingGameMatchSyncRow = {
      id: row.id,
      kickoff_time: row.kickoff_time,
      home_team: row.home_team,
      away_team: row.away_team,
      status: row.status,
      verification_status: row.verification_status,
      admin_notes: row.admin_notes,
      fixture_key: row.fixture_key ?? null,
      province_group: row.province_group ?? null,
      league_group: row.league_group ?? null,
    }
    gameMatchById.set(gm.id, gm)
    const tripletKey = verifiedUniqueTripletKey(gm.kickoff_time, gm.home_team, gm.away_team, gm.verification_status)
    if (tripletKey) {
      uniqueVerifiedTripletToId.set(tripletKey, gm.id)
    }
    const fkNorm = gm.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(gm.fixture_key.trim()) : ''
    if (fkNorm) {
      const prevF = existingByFixtureKey.get(fkNorm)
      existingByFixtureKey.set(fkNorm, prevF ? pickPreferredExistingGmRow(prevF, gm) : gm)
    }
    if (gm.status === 'upcoming' && fkNorm) {
      existingCurrentUpcomingIdsByFixtureNorm.set(fkNorm, gm.id)
    }
  }

  /** Replace-mode baseline: upcoming rows that already have a `fixture_key`. */
  const snapshotUpcomingFixtureNormToId = new Map(existingCurrentUpcomingIdsByFixtureNorm)

  const completedDates = [...new Set(normalized.filter((r) => r.status === 'completed').map((r) => r.match_date))]
  const existingMatchesByDate = new Map<string, Array<{ id: number; team_a_id: number; team_b_id: number }>>()
  if (completedDates.length > 0) {
    const { data: existingMatchesRes } = await supabase
      .from('matches')
      .select('id, match_date, team_a_id, team_b_id')
      .in('match_date', completedDates)
    for (const row of
      ((existingMatchesRes as { id: number; match_date: string; team_a_id: number; team_b_id: number }[] | null) ??
        [])) {
      if (!existingMatchesByDate.has(row.match_date)) existingMatchesByDate.set(row.match_date, [])
      existingMatchesByDate.get(row.match_date)?.push({ id: row.id, team_a_id: row.team_a_id, team_b_id: row.team_b_id })
    }
  }

  if (legacyFixtureKeyBackfill && dryRun) {
    errors.push(
      'Note: legacy_fixture_key_backfill applies only during a live Run sync (not preview). It attaches stable sheet fixture_key values where the normalized slot is free.'
    )
  } else if (legacyFixtureKeyBackfill && !dryRun) {
    for (const gm of [...gameMatchById.values()]) {
      if (gm.fixture_key?.trim()) continue
      const d = dateInSastFromIso(gm.kickoff_time)
      const h = canonicalTeamLabelForGameMatches(gm.home_team, teamRegistry, teams, sheetSyncAliasMap)
      const a = canonicalTeamLabelForGameMatches(gm.away_team, teamRegistry, teams, sheetSyncAliasMap)
      const fk = buildStableSheetFixtureKey(d, h, a)
      const norm = normalizeStableFixtureKeyForLookup(fk)
      const occ = existingByFixtureKey.get(norm)
      if (occ && occ.id !== gm.id) {
        errors.push(
          `Warning: legacy fixture_key backfill skipped for id=${gm.id} (normalized key already used by id=${occ.id}).`
        )
        continue
      }
      const { error } = await supabase.from('game_matches').update({ fixture_key: fk }).eq('id', gm.id)
      if (error) {
        errors.push(`legacy fixture_key backfill failed for id=${gm.id}: ${error.message}`)
        continue
      }
      const next: ExistingGameMatchSyncRow = { ...gm, fixture_key: fk }
      gameMatchById.set(gm.id, next)
      const prevF = existingByFixtureKey.get(norm)
      existingByFixtureKey.set(norm, prevF ? pickPreferredExistingGmRow(prevF, next) : next)
      fixture_key_backfilled += 1
    }
    existingCurrentUpcomingIdsByFixtureNorm.clear()
    for (const g of gameMatchById.values()) {
      const fkNorm = g.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(g.fixture_key.trim()) : ''
      if (g.status === 'upcoming' && fkNorm) {
        existingCurrentUpcomingIdsByFixtureNorm.set(fkNorm, g.id)
      }
    }
  }

  if (dryRun || !hasCriticalTeamDateDuplicates) {
    const completedTeamIdCache = new Map<string, number>()
    await batchEnsureTeamIdsForCompletedRows(supabase, normalized, teams, completedTeamIdCache, errors)

    const plan = prepareSyncPlan(normalized, dryRun ? 'dry_run' : 'run', {
      teamRegistry,
      syncTeams: teams,
      syncTeamAliasMap: sheetSyncAliasMap,
      fixtureGroupMaps,
      fixturesCsvUrl,
      existingByFixtureKey,
      uniqueVerifiedTripletToId,
      gameMatchById,
      existingMatchesByDate,
      completedTeamIdCache,
    })

  for (const e of plan.errors) errors.push(e)
  for (const w of plan.warnings) errors.push(w)
  skipped_duplicates += plan.skippedDuplicates
  would_link_groups = plan.wouldLinkGroupRows
  group_link_warnings += plan.groupLinkWarningAdds

  would_insert_upcoming = plan.gmInserts.filter((i) => i.kind === 'upcoming').length
  would_update_upcoming = plan.gmUpdates.filter((u) => u.kind === 'upcoming' && !u.reactivate).length
  would_reactivate_upcoming = plan.gmUpdates.filter((u) => u.kind === 'upcoming' && u.reactivate).length
  would_insert_completed = plan.gmInserts.filter((i) => i.kind === 'completed').length
  would_update_completed = plan.gmUpdates.filter((u) => u.kind === 'completed').length

  const gmInserts = plan.gmInserts
  const gmUpdates = plan.gmUpdates
  const matchRowUpdates = plan.matchRowUpdates
  const matchRowInserts = plan.matchRowInserts
  let upcomingUpsertFailed = false

  if (replaceUpcoming) {
    for (const norm of snapshotUpcomingFixtureNormToId.keys()) {
      if (sheetUpcomingFixtureNorms.has(norm)) continue
      if (sheetCompletedFixtureNorms.has(norm)) continue
      would_reject_old_upcoming += 1
    }
  }

  if (!dryRun) {
    const syncImportStartedMs = Date.now()
    syncTimedOut = false
    lastProcessedFixtureRow = undefined

    const checkTime = () => {
      if (Date.now() - syncImportStartedMs > SYNC_IMPORT_MAX_MS) {
        syncTimedOut = true
        errors.push(
          `Sheet sync exceeded ${SYNC_IMPORT_MAX_MS / 1000}s before finishing all rows (last step: ${lastProcessedFixtureRow ?? 'unknown'}).`
        )
        return true
      }
      return false
    }

    if (!syncTimedOut) {
      const liveKickoffPairToId = buildKickoffPairOccupantMap(gameMatchById)
      for (let bi = 0; bi < gmUpdates.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = gmUpdates.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.info(`${SYNC_SHEET_LOG} batch game_matches updates`, { batch: i, count: slice.length })
        let fatalUpdateError = false
        for (const u of slice) {
          lastProcessedFixtureRow = u.pairOnDate
          const payload = stripForbiddenWritePayload(u.body as Record<string, unknown>)
          const oldGm = gameMatchById.get(u.id)
          const oldPk = oldGm ? uniqueKickoffPairKey(oldGm.kickoff_time, oldGm.home_team, oldGm.away_team) : ''
          const newPk = uniqueKickoffPairKeyFromPayload(payload)

          const pairOccCheck = newPk ? liveKickoffPairToId.get(newPk) : undefined
          if (newPk && pairOccCheck && pairOccCheck !== u.id) {
            const w = formatGmUpdateSkippedUniquePairWarning(u.id, pairOccCheck, payload)
            errors.push(w)
            console.warn(SYNC_SHEET_LOG, w)
            continue
          }

          const { error } = await supabase.from('game_matches').update(payload).eq('id', u.id)
          if (error) {
            const isPairDup = /game_matches_unique_pair/i.test(error.message)
            if (isPairDup) {
              const w = `Warning: Skipped game_matches update (unique pair conflict, DB). currentId=${u.id} conflictId=unknown home_team=${JSON.stringify(String(payload.home_team ?? ''))} away_team=${JSON.stringify(String(payload.away_team ?? ''))} kickoff_time=${JSON.stringify(String(payload.kickoff_time ?? ''))}. ${GM_SKIP_UNIQUE_PAIR_UPDATE_FIX} dbMessage=${JSON.stringify(error.message)}`
              errors.push(w)
              console.warn(SYNC_SHEET_LOG, w)
              continue
            }
            upcomingUpsertFailed = true
            errors.push(`game_matches batch update failed: ${error.message}`)
            fatalUpdateError = true
            break
          }

          if (oldPk && oldPk !== newPk && liveKickoffPairToId.get(oldPk) === u.id) {
            liveKickoffPairToId.delete(oldPk)
          }
          if (newPk) {
            liveKickoffPairToId.set(newPk, u.id)
          }

          if (oldGm) {
            const oldUk = verifiedUniqueTripletKey(
              oldGm.kickoff_time,
              oldGm.home_team,
              oldGm.away_team,
              oldGm.verification_status
            )
            if (oldUk && uniqueVerifiedTripletToId.get(oldUk) === u.id) {
              uniqueVerifiedTripletToId.delete(oldUk)
            }
          }
          const b = u.body as Record<string, unknown>
          const next: ExistingGameMatchSyncRow = {
            id: u.id,
            kickoff_time: String(b.kickoff_time),
            home_team: String(b.home_team),
            away_team: String(b.away_team),
            status: u.kind === 'completed' ? 'completed' : 'upcoming',
            verification_status: typeof b.verification_status === 'string' ? b.verification_status : 'verified',
            admin_notes: u.prevAdminNotes ?? oldGm?.admin_notes ?? null,
            fixture_key:
              typeof b.fixture_key === 'string'
                ? b.fixture_key
                : (oldGm?.fixture_key ?? null),
            province_group:
              typeof b.province_group === 'string'
                ? b.province_group
                : (oldGm?.province_group ?? null),
            league_group:
              typeof b.league_group === 'string' ? b.league_group : (oldGm?.league_group ?? null),
          }
          gameMatchById.set(u.id, next)
          const newUk = verifiedUniqueTripletKeyFromPayload(payload)
          if (newUk) {
            uniqueVerifiedTripletToId.set(newUk, u.id)
          }
          const fkUp = next.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(next.fixture_key.trim()) : ''
          if (fkUp) {
            const prevF = existingByFixtureKey.get(fkUp)
            existingByFixtureKey.set(fkUp, prevF ? pickPreferredExistingGmRow(prevF, next) : next)
          }
          if (u.kind === 'completed') {
            if (u.pairOnDate) existingCurrentUpcomingIdsByFixtureNorm.delete(u.pairOnDate)
            updated_completed += 1
          } else {
            if (u.pairOnDate) existingCurrentUpcomingIdsByFixtureNorm.set(u.pairOnDate, u.id)
            if (u.reactivate) reactivated_upcoming += 1
            else updated_upcoming += 1
          }
        }
        if (fatalUpdateError) break
      }
    }

    if (!syncTimedOut) {
      const liveKickoffPairInserts = buildKickoffPairOccupantMap(gameMatchById)
      for (let bi = 0; bi < gmInserts.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = gmInserts.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        if (slice.length) lastProcessedFixtureRow = slice[0].pairOnDate
        console.info(`${SYNC_SHEET_LOG} batch game_matches inserts`, { batch: i, count: slice.length })
        let fatalInsertError = false
        for (const meta of slice) {
          const payload = stripForbiddenWritePayload(meta.body as Record<string, unknown>)
          console.info(`${SYNC_SHEET_LOG} inserting new fixture`, {
            kind: meta.kind,
            dedupeKey: sheetFixtureNormFromBody(payload),
          })
          const pk = uniqueKickoffPairKeyFromPayload(payload)
          if (pk && liveKickoffPairInserts.get(pk)) {
            const occ = liveKickoffPairInserts.get(pk)!
            const w = formatGmInsertSkippedUniquePairWarning(occ, payload)
            errors.push(w)
            console.warn(SYNC_SHEET_LOG, w)
            continue
          }
          const { data: ret, error } = await supabase
            .from('game_matches')
            .insert(payload)
            .select('id, kickoff_time, home_team, away_team')
            .maybeSingle()
          if (error) {
            const isPairDup =
              /game_matches_unique_pair/i.test(error.message) ||
              (/duplicate key value violates unique constraint/i.test(error.message) &&
                /game_matches/i.test(error.message))
            if (isPairDup) {
              const w = `${formatGmInsertSkippedUniquePairWarning('unknown', payload)} dbMessage=${JSON.stringify(error.message)}`
              errors.push(w)
              console.warn(SYNC_SHEET_LOG, w)
              continue
            }
            upcomingUpsertFailed = true
            errors.push(`game_matches insert failed: ${error.message}`)
            fatalInsertError = true
            break
          }
          if (!ret?.id) continue
          const id = String(ret.id)
          const st = meta.kind === 'completed' ? 'completed' : 'upcoming'
          const b = meta.body as Record<string, unknown>
          const syncRow: ExistingGameMatchSyncRow = {
            id,
            kickoff_time: String(ret.kickoff_time),
            home_team: String(ret.home_team),
            away_team: String(ret.away_team),
            status: st,
            verification_status: 'verified',
            admin_notes: null,
            fixture_key: typeof b.fixture_key === 'string' ? b.fixture_key : null,
            province_group: typeof b.province_group === 'string' ? b.province_group : null,
            league_group: typeof b.league_group === 'string' ? b.league_group : null,
          }
          gameMatchById.set(id, syncRow)
          const pkAfter = uniqueKickoffPairKey(syncRow.kickoff_time, syncRow.home_team, syncRow.away_team)
          if (pkAfter) {
            liveKickoffPairInserts.set(pkAfter, id)
          }
          const ut = verifiedUniqueTripletKey(
            syncRow.kickoff_time,
            syncRow.home_team,
            syncRow.away_team,
            syncRow.verification_status
          )
          if (ut) {
            uniqueVerifiedTripletToId.set(ut, id)
          }
          const fkIns = syncRow.fixture_key?.trim() ? normalizeStableFixtureKeyForLookup(syncRow.fixture_key.trim()) : ''
          if (fkIns) {
            const prevFk = existingByFixtureKey.get(fkIns)
            existingByFixtureKey.set(fkIns, prevFk ? pickPreferredExistingGmRow(prevFk, syncRow) : syncRow)
          }
          if (meta.kind === 'upcoming') {
            if (meta.pairOnDate) existingCurrentUpcomingIdsByFixtureNorm.set(meta.pairOnDate, id)
            inserted_upcoming += 1
          } else {
            if (meta.pairOnDate) existingCurrentUpcomingIdsByFixtureNorm.delete(meta.pairOnDate)
            inserted_completed += 1
          }
        }
        if (fatalInsertError) break
      }
    }

    if (!syncTimedOut) {
      for (let bi = 0; bi < matchRowUpdates.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = matchRowUpdates.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.info(`${SYNC_SHEET_LOG} batch matches updates`, { batch: i, count: slice.length })
        let matchesBatchAborted = false
        let updatedInBatch = 0
        for (const r of slice) {
          const payload = stripForbiddenWritePayload({
            team_a_score: r.team_a_score,
            team_b_score: r.team_b_score,
            season: r.season,
          } as Record<string, unknown>)
          const { error } = await supabase.from('matches').update(payload).eq('id', r.id)
          if (error) {
            errors.push(`matches batch update failed: ${error.message}`)
            matchesBatchAborted = true
            break
          }
          updatedInBatch += 1
        }
        if (matchesBatchAborted) break
        matches_updated += updatedInBatch
      }
    }

    if (!syncTimedOut) {
      for (let bi = 0; bi < matchRowInserts.length; bi += SYNC_BATCH_SIZE) {
        if (checkTime()) break
        const slice = matchRowInserts.slice(bi, bi + SYNC_BATCH_SIZE)
        const i = Math.floor(bi / SYNC_BATCH_SIZE)
        console.info(`${SYNC_SHEET_LOG} batch matches inserts`, { batch: i, count: slice.length })
        const rowsWithoutId = slice.map((r) =>
          stripForbiddenWritePayload({
            team_a_id: r.team_a_id,
            team_b_id: r.team_b_id,
            team_a_score: r.team_a_score,
            team_b_score: r.team_b_score,
            match_date: r.match_date,
            season: r.season,
          } as Record<string, unknown>)
        )
        const { data, error } = await supabase
          .from('matches')
          .insert(rowsWithoutId)
          .select('id, team_a_id, team_b_id, match_date')
        if (error) {
          errors.push(`matches batch insert failed: ${error.message}`)
          break
        }
        matches_inserted += slice.length
        for (let j = 0; j < slice.length; j += 1) {
          const ins = slice[j]
          const ret = data?.[j]
          if (!ret?.id) continue
          if (!existingMatchesByDate.has(ins.match_date)) existingMatchesByDate.set(ins.match_date, [])
          existingMatchesByDate.get(ins.match_date)?.push({
            id: ret.id as number,
            team_a_id: ret.team_a_id as number,
            team_b_id: ret.team_b_id as number,
          })
        }
      }
    }

    if (replaceUpcoming && !upcomingUpsertFailed && !syncTimedOut) {
      const note = 'Replaced by Google Sheet sync (Teams + Fixtures)'
      for (const [norm] of snapshotUpcomingFixtureNormToId.entries()) {
        if (sheetUpcomingFixtureNorms.has(norm)) continue
        if (sheetCompletedFixtureNorms.has(norm)) continue
        const currentId = snapshotUpcomingFixtureNormToId.get(norm)
        const current = currentId ? gameMatchById.get(currentId) : undefined
        if (!current || current.status !== 'upcoming') continue
        const combinedNotes = [current.admin_notes?.trim(), note].filter(Boolean).join(' | ')
        const { error: rejectErr } = await supabase
          .from('game_matches')
          .update({
            verification_status: 'rejected',
            rejected_reason: note,
            admin_notes: combinedNotes || null,
          })
          .eq('id', current.id)
        if (rejectErr) {
          errors.push(`Could not reject existing upcoming fixture ${current.id}: ${rejectErr.message}`)
        } else {
          rejected_old_upcoming += 1
        }
      }
    } else if (replaceUpcoming && upcomingUpsertFailed) {
      errors.push('Replace mode skipped old-upcoming rejection because one or more upcoming upserts failed.')
    }
  }
  }
  const group_link_failures = 0
  const game_matches_inserted = inserted_upcoming + inserted_completed
  const game_matches_updated = updated_upcoming + updated_completed

  const summary: SyncSummary = {
    mode: dryRun ? 'dry_run' : 'run',
    replace_upcoming: replaceUpcoming,
    incoming_rows: parsed.rows.length,
    would_insert_upcoming,
    would_update_upcoming,
    would_reactivate_upcoming,
    would_reject_old_upcoming,
    would_insert_completed,
    would_update_completed,
    would_insert_completed_game_matches: would_insert_completed,
    would_update_completed_game_matches: would_update_completed,
    inserted_upcoming,
    updated_upcoming,
    reactivated_upcoming,
    rejected_old_upcoming,
    inserted_completed,
    updated_completed,
    skipped_duplicates,
    province_group_warnings,
    would_link_groups,
    linked_groups: 0,
    group_link_warnings,
    group_link_failures,
    skipped_group_linking_count: 0,
    game_matches_inserted,
    game_matches_updated,
    matches_inserted,
    matches_updated,
    completed_matches_scored: 0,
    post_sync_sweep_scored: 0,
    post_sync_sweep_attempted: 0,
    group_link_repair_examined: 0,
    group_link_repair_linked: 0,
    ...(!dryRun && !syncTimedOut ? { sync_import_notice: SYNC_IMPORT_FOLLOWUP_NOTICE } : {}),
    ...(syncTimedOut && !dryRun && lastProcessedFixtureRow
      ? { last_processed_fixture_row: lastProcessedFixtureRow }
      : {}),
    validation_errors: errors,
    warnings: buildStructuredWarningsFromStrings(errors),
    ...(teamsRegistryDebug ? { teams_registry_debug: teamsRegistryDebug } : {}),
    ...(fixture_key_backfilled > 0 ? { fixture_key_backfilled } : {}),
  }

  const { error: logErr } = await supabase.from('sync_runs').insert({
    mode: dryRun ? 'dry_run' : 'run',
    replace_upcoming: replaceUpcoming,
    incoming_rows: parsed.rows.length,
    inserted_upcoming,
    updated_upcoming,
    reactivated_upcoming,
    rejected_old_upcoming,
    inserted_completed,
    updated_completed,
    skipped_duplicates,
    province_group_warnings,
    would_link_groups,
    linked_groups,
    group_link_warnings,
    validation_errors: errors,
    summary,
  })
  if (logErr) {
    errors.push(`Sync log insert failed: ${logErr.message}`)
  }

  const warnings = buildStructuredWarningsFromStrings(errors)
  const responseSummary: SyncSummary = {
    ...summary,
    validation_errors: errors,
    warnings,
  }

  if (!dryRun && syncTimedOut) {
    return NextResponse.json(
      {
        ok: false,
        error: `Sheet sync exceeded ${SYNC_IMPORT_MAX_MS / 1000}s before finishing all rows.`,
        ...responseSummary,
      },
      { status: 408 }
    )
  }

  const ok = !hasCriticalTeamDateDuplicates && (dryRun || !syncTimedOut)

  return NextResponse.json({
    ok,
    ...responseSummary,
  })
}
