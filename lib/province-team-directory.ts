import { normalizeProvinceLabelForGameMatches } from './fixture-group-resolve'
import { normalizeProvinceCode, provinceCodesForFixtureGroupSlug } from './teams-sheet-province'

/**
 * Whether a Teams-tab `province` value belongs to this province fixture group.
 * Prefers normalized sheet codes (BUL, PUM, …); falls back to display-name matching for legacy rows.
 * Teams Google Sheet is the master: `teams.province` should use these short codes.
 */
export function teamProvinceMatchesFixtureGroup(
  teamProvinceRaw: string | null | undefined,
  groupSlug: string,
  groupName: string
): boolean {
  const raw = (teamProvinceRaw ?? '').trim()
  if (!raw) return false

  const teamCode = normalizeProvinceCode(raw)
  const groupCodes = provinceCodesForFixtureGroupSlug(groupSlug.trim().toLowerCase())
  if (teamCode && groupCodes.includes(teamCode)) return true

  // Legacy: normalized full names vs group display name / extras
  const slug = groupSlug.trim().toLowerCase()
  const normalized = normalizeProvinceLabelForGameMatches(raw)
  const labels = displayLabelsForGroup(slug, groupName)
  if (normalized && labels.has(normFold(normalized))) return true
  if (labels.has(normFold(raw))) return true
  return false
}

function normFold(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
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
  'blue-bulls': ['Blue Bulls'],
  'northern-cape': ['Northern Cape'],
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
 * @deprecated Use `provinceCodesForFixtureGroupSlug` from `teams-sheet-province`.
 */
export function teamProvinceCodesForFixtureGroupSlug(slug: string): Set<string> {
  return new Set(provinceCodesForFixtureGroupSlug(slug).map((c) => c.toLowerCase()))
}
