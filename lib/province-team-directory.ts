import { normalizeProvinceLabelForGameMatches } from './fixture-group-resolve'

/**
 * Primary `teams.province` short codes (case-insensitive) for each province fixture group slug.
 * Keep aligned with `PROVINCE_CODE_TO_CANONICAL_SLUG` / sheet codes.
 */
const SLUG_TO_TEAM_PROVINCE_CODES: Record<string, string[]> = {
  'western-province': ['WP'],
  boland: ['BL'],
  'south-western-districts': ['SWD'],
  'kwazulu-natal': ['KZN'],
  'eastern-cape': ['EP'],
  'free-state-griquas': ['FS'],
  'northern-cape': ['NC'],
  pumas: ['PUM'],
  limpopo: ['LIM'],
  leopards: ['LEO'],
  gauteng: ['GP'],
  'blue-bulls': ['BUL'],
}

/** Extra display strings (after `normalizeProvinceLabelForGameMatches`) that should match a slug. */
const SLUG_TO_EXTRA_DISPLAYS: Record<string, string[]> = {
  'south-western-districts': ['South Western Districts'],
  'free-state-griquas': ['Free State / Griquas', 'Free State', 'Griquas'],
  'kwazulu-natal': ['KwaZulu-Natal', 'KwaZulu Natal'],
  'western-province': ['Western Province'],
  'eastern-cape': ['Eastern Cape', 'Eastern Province'],
  leopards: ['Leopards'],
  pumas: ['Pumas'],
  limpopo: ['Limpopo'],
  'northern-cape': ['Northern Cape'],
}

function normFold(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Short codes accepted on `teams.province` for this fixture group (lowercase).
 */
export function teamProvinceCodesForFixtureGroupSlug(slug: string): Set<string> {
  const key = slug.trim().toLowerCase()
  const list = SLUG_TO_TEAM_PROVINCE_CODES[key] ?? []
  return new Set(list.map((c) => c.trim().toLowerCase()).filter(Boolean))
}

function displayLabelsForGroup(slug: string, groupName: string): Set<string> {
  const out = new Set<string>()
  const n = normalizeProvinceLabelForGameMatches(groupName)
  if (n) out.add(normFold(n))
  out.add(normFold(groupName))
  const key = slug.trim().toLowerCase()
  for (const x of SLUG_TO_EXTRA_DISPLAYS[key] ?? []) {
    const nx = normalizeProvinceLabelForGameMatches(x)
    if (nx) out.add(normFold(nx))
    out.add(normFold(x))
  }
  return out
}

/**
 * Whether a Teams-tab `province` value belongs to this province fixture group.
 * Matches short codes (BL, WP, …) or full names normalized the same way as `game_matches` province labels.
 */
export function teamProvinceMatchesFixtureGroup(
  teamProvinceRaw: string | null | undefined,
  groupSlug: string,
  groupName: string
): boolean {
  const raw = (teamProvinceRaw ?? '').trim()
  if (!raw) return false
  const slug = groupSlug.trim().toLowerCase()
  const codes = teamProvinceCodesForFixtureGroupSlug(slug)
  const lower = raw.toLowerCase()
  if (/^[a-z]{2,4}$/.test(lower) && codes.has(lower)) return true

  const normalized = normalizeProvinceLabelForGameMatches(raw)
  const labels = displayLabelsForGroup(slug, groupName)
  if (normalized && labels.has(normFold(normalized))) return true
  if (labels.has(normFold(raw))) return true
  return false
}
