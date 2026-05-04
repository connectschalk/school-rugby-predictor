import { buildTeamAliasResolverMap } from '@/lib/team-aliases-db'
import { normalizeTeamKey, normalizeTeamKeyLoose, type TeamRow } from '@/lib/team-name-match'

export type TeamDbRowForPicker = {
  id: number
  name: string
  canonical_name?: string | null
  /** Sheet / Teams tab province short code or full label (e.g. BL, Boland). */
  province?: string | null
}

/** Fold for dedupe: strip combining marks, lowercase, collapse spaces. */
export function foldForTeamDedupe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function displayPreferenceScore(s: string): number {
  let score = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp > 127) score += 6
  }
  score += (s.normalize('NFD').match(/\p{M}/gu) ?? []).length * 10
  score += s.length * 0.001
  return score
}

/**
 * Prefer Teams tab `canonical_name` when present; otherwise legacy `name`.
 * Does not merge the two — canonical_name is the source of truth when non-empty.
 */
export function pickTeamsTabDisplayCanonical(row: TeamDbRowForPicker): string {
  const c = (row.canonical_name ?? '').trim()
  if (c) return c
  return (row.name ?? '').trim()
}

/**
 * Distinct selectable names: one per ASCII-fold bucket, preferring diacritic-rich / higher-scoring labels.
 */
export function dedupeTeamRowsToCanonicalOptions(rows: TeamDbRowForPicker[]): string[] {
  const byFold = new Map<string, string>()
  for (const row of rows) {
    const display = pickTeamsTabDisplayCanonical(row)
    if (!display) continue
    const key = foldForTeamDedupe(display)
    if (!key) continue
    const prev = byFold.get(key)
    if (!prev) {
      byFold.set(key, display)
      continue
    }
    const sNew = displayPreferenceScore(display)
    const sOld = displayPreferenceScore(prev)
    if (sNew > sOld) byFold.set(key, display)
    else if (sNew === sOld && display.localeCompare(prev) < 0) byFold.set(key, display)
  }
  return [...byFold.values()].sort((a, b) => a.localeCompare(b))
}

export function resolveToPickerCanonical(name: string, dedupedCanonicals: string[]): string | null {
  const t = name.trim()
  if (!t) return null
  const fk = foldForTeamDedupe(t)
  for (const c of dedupedCanonicals) {
    if (foldForTeamDedupe(c) === fk) return c
  }
  const nk = normalizeTeamKey(t)
  for (const c of dedupedCanonicals) {
    if (normalizeTeamKey(c) === nk) return c
  }
  return null
}

/**
 * Map normalized alias keys (and normalized canonical keys) → deduped canonical display string.
 * Alias rows never appear as values — only canonical picker strings.
 */
export function buildPoolPickerAliasLookup(
  aliasRows: Record<string, unknown>[],
  teamRows: TeamDbRowForPicker[],
  dedupedCanonicals: string[]
): Map<string, string> {
  const foldToCanonical = new Map<string, string>()
  for (const c of dedupedCanonicals) {
    foldToCanonical.set(foldForTeamDedupe(c), c)
  }

  function mapResolvedStringToCanonical(s: string): string | null {
    const t = s.trim()
    if (!t) return null
    const fromFold = foldToCanonical.get(foldForTeamDedupe(t))
    if (fromFold) return fromFold
    return resolveToPickerCanonical(t, dedupedCanonicals)
  }

  const legacyTeamsForInfer: TeamRow[] = teamRows.map((r) => ({
    id: Number(r.id),
    name: (r.name ?? '').trim() || pickTeamsTabDisplayCanonical(r),
  }))

  const base = buildTeamAliasResolverMap(aliasRows, legacyTeamsForInfer)
  const out = new Map<string, string>()

  for (const [aliasKey, resolvedName] of base) {
    const canon = mapResolvedStringToCanonical(String(resolvedName))
    if (canon) out.set(aliasKey, canon)
  }

  for (const c of dedupedCanonicals) {
    const nk = normalizeTeamKey(c)
    const nl = normalizeTeamKeyLoose(c)
    if (nk) out.set(nk, c)
    if (nl && nl !== nk) out.set(nl, c)
  }

  return out
}

/** Filter canonical list + alias hits for the picker search box. */
export function filterCanonicalsForPickerQuery(
  allCanonicals: string[],
  queryRaw: string,
  aliasKeyToCanonical: Map<string, string> | null
): string[] {
  const q = queryRaw.trim()
  if (!q) return allCanonicals

  const hit = new Set<string>()
  const ql = q.toLowerCase()
  const qFold = foldForTeamDedupe(q)

  for (const t of allCanonicals) {
    if (t.toLowerCase().includes(ql)) hit.add(t)
    if (qFold && foldForTeamDedupe(t).includes(qFold)) hit.add(t)
  }

  if (aliasKeyToCanonical && aliasKeyToCanonical.size > 0) {
    const qk = normalizeTeamKey(q)
    const qLoose = normalizeTeamKeyLoose(q)
    const direct = (qk && aliasKeyToCanonical.get(qk)) ?? (qLoose ? aliasKeyToCanonical.get(qLoose) : undefined)
    if (direct) hit.add(direct)

    if (qk.length >= 2) {
      for (const [key, canon] of aliasKeyToCanonical) {
        if (key.length < 2) continue
        if (key.includes(qk) || qk.includes(key)) hit.add(canon)
      }
    }
  }

  return [...hit].sort((a, b) => a.localeCompare(b))
}
