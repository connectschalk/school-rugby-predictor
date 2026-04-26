import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeTeamKey, normalizeTeamKeyLoose, type TeamRow } from '@/lib/team-name-match'

export type TeamAliasDbRow = Record<string, unknown>

const RAW_COL_CANDIDATES = [
  'raw_name',
  'alias',
  'alternate_name',
  'nickname',
  'from_name',
  'school_alias',
  'source_name',
  'mapped_from',
] as const

const CANONICAL_TEXT_COL_CANDIDATES = [
  'canonical_name',
  'official_name',
  'mapped_name',
  'full_name',
  'resolved_name',
  'canonical_team_name',
  'team_name',
] as const

const TEAM_ID_COL_CANDIDATES = ['team_id', 'canonical_team_id', 'matched_team_id'] as const

type InferredSchema =
  | { kind: 'raw_to_canonical_text'; rawCol: string; canonicalCol: string }
  | { kind: 'raw_to_team_id'; rawCol: string; teamIdCol: string }

function lowerKeyMap(row: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>()
  for (const k of Object.keys(row)) {
    m.set(k.toLowerCase(), k)
  }
  return m
}

function pickColumn(keys: Map<string, string>, candidates: readonly string[]): string | undefined {
  for (const c of candidates) {
    const hit = keys.get(c.toLowerCase())
    if (hit) return hit
  }
  return undefined
}

/** Infer how `public.team_aliases` maps raw input → canonical `teams.name`. */
export function inferTeamAliasSchema(sample: TeamAliasDbRow | undefined): InferredSchema | null {
  if (!sample || typeof sample !== 'object') return null
  const keys = lowerKeyMap(sample)
  const rawCol = pickColumn(keys, RAW_COL_CANDIDATES)
  if (!rawCol) return null

  const canonicalCol = pickColumn(keys, CANONICAL_TEXT_COL_CANDIDATES)
  const teamIdCol = pickColumn(keys, TEAM_ID_COL_CANDIDATES)

  const canonStr = canonicalCol != null ? String(sample[canonicalCol] ?? '').trim() : ''
  const teamIdVal = teamIdCol != null ? sample[teamIdCol] : undefined
  const teamIdNum = teamIdVal != null && teamIdVal !== '' ? Number(teamIdVal) : NaN

  if (canonicalCol && canonStr) {
    return { kind: 'raw_to_canonical_text', rawCol, canonicalCol }
  }
  if (teamIdCol && Number.isFinite(teamIdNum)) {
    return { kind: 'raw_to_team_id', rawCol, teamIdCol }
  }
  if (canonicalCol) {
    return { kind: 'raw_to_canonical_text', rawCol, canonicalCol }
  }
  if (teamIdCol) {
    return { kind: 'raw_to_team_id', rawCol, teamIdCol }
  }
  return null
}

function rowRawString(row: TeamAliasDbRow, rawCol: string): string {
  return String(row[rawCol] ?? '').trim()
}

function rowToCanonicalName(row: TeamAliasDbRow, schema: InferredSchema, teams: TeamRow[]): string | null {
  if (schema.kind === 'raw_to_canonical_text') {
    const s = String(row[schema.canonicalCol] ?? '').trim()
    return s || null
  }
  const id = Number(row[schema.teamIdCol])
  if (!Number.isFinite(id)) return null
  const t = teams.find((x) => x.id === id)
  return t?.name ?? null
}

/**
 * Map for `matchTeamName` third argument: normalized raw → exact `teams.name` string from DB.
 */
export function buildTeamAliasResolverMap(rows: TeamAliasDbRow[], teams: TeamRow[]): Map<string, string> {
  const m = new Map<string, string>()
  const schema = rows.length > 0 ? inferTeamAliasSchema(rows[0]) : null
  if (!schema) return m

  for (const row of rows) {
    const raw = rowRawString(row, schema.rawCol)
    if (!raw) continue
    const canon = rowToCanonicalName(row, schema, teams)
    if (!canon) continue
    const k = normalizeTeamKey(raw)
    if (k) m.set(k, canon)
    const loose = normalizeTeamKeyLoose(raw)
    if (loose && loose !== k) m.set(loose, canon)
  }
  return m
}

function existingNormalizedRawKeys(rows: TeamAliasDbRow[], schema: InferredSchema): Set<string> {
  const s = new Set<string>()
  for (const row of rows) {
    const raw = rowRawString(row, schema.rawCol)
    if (!raw) continue
    s.add(normalizeTeamKey(raw))
    const loose = normalizeTeamKeyLoose(raw)
    if (loose) s.add(loose)
  }
  return s
}

const DEFAULT_INSERT_SCHEMA: InferredSchema = {
  kind: 'raw_to_canonical_text',
  rawCol: 'raw_name',
  canonicalCol: 'canonical_name',
}

function findTeamIdByName(teams: TeamRow[], name: string): number | null {
  const t = teams.find((x) => normalizeTeamKey(x.name) === normalizeTeamKey(name))
  return t?.id ?? null
}

export type NewAliasPair = { raw: string; canonicalName: string }

/**
 * Inserts only **new** aliases (normalized raw not already present). Never updates existing rows.
 */
export async function insertNewTeamAliasesOnly(
  supabase: SupabaseClient,
  teams: TeamRow[],
  pairs: NewAliasPair[]
): Promise<{ inserted: number; error?: string }> {
  const { data: existingRows, error: loadErr } = await supabase.from('team_aliases').select('*')
  if (loadErr) {
    return { inserted: 0, error: loadErr.message }
  }
  const existing = (existingRows ?? []) as TeamAliasDbRow[]
  const inferred = existing.length > 0 ? inferTeamAliasSchema(existing[0]) : null
  if (existing.length > 0 && !inferred) {
    return {
      inserted: 0,
      error:
        'Could not interpret public.team_aliases columns (need a raw-name field plus canonical text or team_id).',
    }
  }
  const schema = inferred ?? DEFAULT_INSERT_SCHEMA

  const taken = existingNormalizedRawKeys(existing, schema)
  const payloads: TeamAliasDbRow[] = []

  for (const p of pairs) {
    const raw = p.raw.trim()
    const canon = p.canonicalName.trim()
    if (!raw || !canon) continue
    if (normalizeTeamKey(raw) === normalizeTeamKey(canon)) continue

    const nk = normalizeTeamKey(raw)
    const nl = normalizeTeamKeyLoose(raw)
    if (taken.has(nk) || (nl && taken.has(nl))) {
      continue
    }
    taken.add(nk)
    if (nl) taken.add(nl)

    if (schema.kind === 'raw_to_canonical_text') {
      payloads.push({
        [schema.rawCol]: raw,
        [schema.canonicalCol]: canon,
      })
    } else {
      const tid = findTeamIdByName(teams, canon)
      if (tid == null) continue
      payloads.push({
        [schema.rawCol]: raw,
        [schema.teamIdCol]: tid,
      })
    }
  }

  if (payloads.length === 0) {
    return { inserted: 0 }
  }

  const { error: insErr } = await supabase.from('team_aliases').insert(payloads)
  if (insErr) {
    return { inserted: 0, error: insErr.message }
  }
  return { inserted: payloads.length }
}

/** Raw alias strings in `team_aliases` that resolve to the same canonical team name as `canonicalTeamName`. */
export function collectAliasRawStringsForCanonicalTeam(
  canonicalTeamName: string,
  aliasRows: TeamAliasDbRow[],
  teams: TeamRow[]
): string[] {
  if (!canonicalTeamName.trim() || aliasRows.length === 0) return []
  const schema = inferTeamAliasSchema(aliasRows[0])
  if (!schema) return []
  const target = normalizeTeamKey(canonicalTeamName)
  const out: string[] = []
  for (const row of aliasRows) {
    const canon = rowToCanonicalName(row, schema, teams)
    if (!canon || normalizeTeamKey(canon) !== target) continue
    const raw = rowRawString(row, schema.rawCol)
    if (raw) out.push(raw)
  }
  return out
}

/** Lowercased searchable text for home/away + known aliases (e.g. “Affies” for Afrikaans Hoër Seuns). */
export function buildGameMatchSearchText(
  m: { home_team: string; away_team: string },
  aliasRows: TeamAliasDbRow[],
  teams: TeamRow[]
): string {
  const parts = [
    m.home_team,
    m.away_team,
    ...collectAliasRawStringsForCanonicalTeam(m.home_team, aliasRows, teams),
    ...collectAliasRawStringsForCanonicalTeam(m.away_team, aliasRows, teams),
  ]
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchGameAgainstTeamSearch(
  m: { home_team: string; away_team: string },
  query: string,
  aliasRows: TeamAliasDbRow[],
  teams: TeamRow[]
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return buildGameMatchSearchText(m, aliasRows, teams).includes(q)
}
