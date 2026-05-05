/**
 * Province / union branding logos under `public/province-logos/{CODE}.png`.
 * Code normalization and display names come from `teams-sheet-province.ts` (Teams tab is master).
 */

import {
  getProvinceLogo,
  matchBelongsToProvinceCode,
  normalizeProvinceCode,
  provinceCodesForFixtureGroupSlug,
  resolveProvinceCodeFromLabel,
  TEAMS_SHEET_CODE_TO_DISPLAY_NAME,
  TEAMS_SHEET_PROVINCE_CODES,
  type TeamsSheetProvinceCode,
} from './teams-sheet-province'

export const PROVINCE_LOGO_CODES = TEAMS_SHEET_PROVINCE_CODES

export type ProvinceLogoCode = TeamsSheetProvinceCode

/**
 * Province crest row on Predict (and similar UIs). NC remains in codes for DB / mapping only.
 * NC temporarily hidden until sufficient team coverage
 */
export const PROVINCE_LOGO_CODES_UI_ORDER = [
  'WP',
  'KZN',
  'EP',
  'FS',
  'GP',
  'BUL',
  'PUM',
  'LIM',
  'LEO',
  'BL',
  'SWD',
] as const satisfies readonly ProvinceLogoCode[]

export type ProvinceLogoCodeUi = (typeof PROVINCE_LOGO_CODES_UI_ORDER)[number]

/** Tooltip / `title` text for quick province filters on Predict. */
export const PROVINCE_LOGO_TITLES: Record<ProvinceLogoCode, string> = TEAMS_SHEET_CODE_TO_DISPLAY_NAME

/** Canonical heading for province-filtered list (Teams sheet → `game_matches` province labels). */
export const PROVINCE_PREDICT_FILTER_LABEL: Record<ProvinceLogoCode, string> = TEAMS_SHEET_CODE_TO_DISPLAY_NAME

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const SLUG_TO_CODE: Record<string, ProvinceLogoCode> = {
  wp: 'WP',
  'western-province': 'WP',
  'western province': 'WP',
  kzn: 'KZN',
  kwazulu: 'KZN',
  'kwazulu-natal': 'KZN',
  ep: 'EP',
  'eastern-province': 'EP',
  'eastern cape': 'EP',
  fs: 'FS',
  'free-state': 'FS',
  griquas: 'FS',
  nc: 'NC',
  'northern-cape': 'NC',
  gp: 'GP',
  gauteng: 'GP',
  bul: 'BUL',
  'blue-bulls': 'BUL',
  leo: 'LEO',
  leopards: 'LEO',
  lim: 'LIM',
  limpopo: 'LIM',
  pum: 'PUM',
  pumas: 'PUM',
  bl: 'BL',
  boland: 'BL',
  swd: 'SWD',
  'south-western-districts': 'SWD',
}

export function getProvinceLogoPath(code: ProvinceLogoCode): string {
  return getProvinceLogo(code)
}

export function isKnownProvinceLogoCode(s: string): s is ProvinceLogoCode {
  return (PROVINCE_LOGO_CODES as readonly string[]).includes(s)
}

/** Resolve logo code from a section heading or fixture group display name. */
export function resolveProvinceLogoCodeFromLabel(label: string): ProvinceLogoCode | null {
  return resolveProvinceCodeFromLabel(label)
}

/**
 * Map a single `game_matches.home_team_province` / `away_team_province` to a filter code.
 * Normalizes sheet short codes and display names per Teams sheet master mapping.
 */
export function matchProvinceFieldToCode(raw: string | null | undefined): ProvinceLogoCode | null {
  return normalizeProvinceCode(raw)
}

/** True if either team province field resolves to the same logo `code` (Predict quick filter). */
export function matchBelongsToProvinceLogoCode(
  homeTeamProvince: string | null | undefined,
  awayTeamProvince: string | null | undefined,
  code: ProvinceLogoCode
): boolean {
  return matchBelongsToProvinceCode(homeTeamProvince, awayTeamProvince, code)
}

/**
 * Resolve from fixture group `slug` (preferred) then `name`.
 * Slugs are hyphenated in DB; we normalize to the same keys as `SLUG_TO_CODE`.
 */
export function resolveProvinceLogoCodeFromFixtureGroup(name: string, slug?: string | null): ProvinceLogoCode | null {
  if (slug) {
    const fromCanon = provinceCodesForFixtureGroupSlug(slug)
    if (fromCanon.length > 0) return fromCanon[0]!
    const s = norm(slug).replace(/\s+/g, '-')
    if (SLUG_TO_CODE[s]) return SLUG_TO_CODE[s]
    const slugSpaces = norm(slug)
    if (SLUG_TO_CODE[slugSpaces]) return SLUG_TO_CODE[slugSpaces]
  }
  return resolveProvinceCodeFromLabel(name)
}

/** Re-export shared Teams-sheet helpers (canonical_name + province is master). */
export {
  getProvinceDisplayName,
  getProvinceLogo,
  getTeamsForProvince,
  normalizeProvinceCode,
  provinceCodesForFixtureGroupSlug,
} from './teams-sheet-province'

/** Two-letter (or shorter) initials for circular fallback when no asset / image error. */
export function provinceDisplayInitials(label: string): string {
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]!.replace(/[^a-zA-Z]/g, '')
    const b = parts[1]!.replace(/[^a-zA-Z]/g, '')
    const out = ((a[0] ?? '') + (b[0] ?? '')).toUpperCase()
    if (out.length > 0) return out.slice(0, 2)
  }
  const letters = t.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase()
  if (letters.length === 1) return letters.toUpperCase()
  return t.slice(0, 2).toUpperCase()
}
