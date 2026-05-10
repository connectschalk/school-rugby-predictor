import type { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeTeamKey,
  normalizeTeamKeyAsciiFold,
  normalizeTeamKeyLoose,
  type TeamRow,
} from '@/lib/team-name-match'

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
  'canonical_team_name',
  'official_name',
  'full_name',
  'resolved_name',
  'team_name',
  'mapped_name',
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

  const teamIdCol = pickColumn(keys, TEAM_ID_COL_CANDIDATES)
  const teamIdVal = teamIdCol != null ? sample[teamIdCol] : undefined
  const teamIdNum = teamIdVal != null && teamIdVal !== '' ? Number(teamIdVal) : NaN
  const rawPreview = String(sample[rawCol] ?? '').trim()

  if (teamIdCol && Number.isFinite(teamIdNum) && rawPreview) {
    return { kind: 'raw_to_team_id', rawCol, teamIdCol }
  }

  const canonicalCol = pickColumn(keys, CANONICAL_TEXT_COL_CANDIDATES)
  const canonStr = canonicalCol != null ? String(sample[canonicalCol] ?? '').trim() : ''

  if (canonicalCol && canonStr) {
    return { kind: 'raw_to_canonical_text', rawCol, canonicalCol }
  }
  if (teamIdCol && Number.isFinite(teamIdNum)) {
    return { kind: 'raw_to_team_id', rawCol, teamIdCol }
  }
  if (canonicalCol) {
    return { kind: 'raw_to_canonical_text', rawCol, canonicalCol }
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
    const af = normalizeTeamKeyAsciiFold(raw)
    if (af && af !== k && af !== loose) m.set(af, canon)
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
    const af = normalizeTeamKeyAsciiFold(raw)
    if (af) s.add(af)
  }
  return s
}

function findTeamIdByName(teams: TeamRow[], name: string): number | null {
  const nk = normalizeTeamKey(name)
  const naf = normalizeTeamKeyAsciiFold(name)
  for (const x of teams) {
    if (normalizeTeamKey(x.name) === nk) return x.id
    const c = x.canonical_name?.trim()
    if (c) {
      if (normalizeTeamKey(c) === nk) return x.id
      if (normalizeTeamKeyAsciiFold(c) === naf) return x.id
    }
    if (normalizeTeamKeyAsciiFold(x.name) === naf) return x.id
  }
  return null
}

export type NewAliasPair = { raw: string; canonicalName: string }

/**
 * Inserts only **new** aliases (normalized raw not already present). Never updates existing rows.
 */
export async function insertNewTeamAliasesOnly(
  supabase: SupabaseClient,
  teams: TeamRow[],
  pairs: NewAliasPair[]
): Promise<{ inserted: number; error?: string; warning?: string }> {
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
  if (!inferred) {
    return {
      inserted: 0,
      warning:
        'Skipped team alias sync: could not infer public.team_aliases schema from current data. Fixture import still completed.',
    }
  }
  const schema = inferred

  const taken = existingNormalizedRawKeys(existing, schema)
  const payloads: TeamAliasDbRow[] = []

  for (const p of pairs) {
    const raw = p.raw.trim()
    const canon = p.canonicalName.trim()
    if (!raw || !canon) continue
    if (normalizeTeamKey(raw) === normalizeTeamKey(canon)) continue

    const nk = normalizeTeamKey(raw)
    const nl = normalizeTeamKeyLoose(raw)
    const naf = normalizeTeamKeyAsciiFold(raw)
    if (taken.has(nk) || (nl && taken.has(nl)) || (naf && taken.has(naf))) {
      continue
    }
    taken.add(nk)
    if (nl) taken.add(nl)
    if (naf) taken.add(naf)

    if (schema.kind === 'raw_to_canonical_text') {
      payloads.push({
        [schema.rawCol]: raw,
        [schema.canonicalCol]: canon,
        normalized_alias: normalizeTeamKeyAsciiFold(raw),
      })
    } else {
      const tid = findTeamIdByName(teams, canon)
      if (tid == null) continue
      payloads.push({
        [schema.rawCol]: raw,
        [schema.teamIdCol]: tid,
        normalized_alias: normalizeTeamKeyAsciiFold(raw),
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
  const targetAf = normalizeTeamKeyAsciiFold(canonicalTeamName)
  const out: string[] = []
  for (const row of aliasRows) {
    const canon = rowToCanonicalName(row, schema, teams)
    if (!canon || normalizeTeamKeyAsciiFold(canon) !== targetAf) continue
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
