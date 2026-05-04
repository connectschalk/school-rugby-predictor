/**
 * Province / union branding logos under `public/province-logos/{CODE}.png`.
 * Matching is name + optional fixture_group slug only (no DB reads).
 */

import { normalizeProvinceLabelForGameMatches } from './fixture-group-resolve'

export const PROVINCE_LOGO_CODES = [
  'WP',
  'KZN',
  'EP',
  'FS',
  'NC',
  'GP',
  'BUL',
  'LEO',
  'LIM',
  'PUM',
  'BL',
  'SWD',
] as const

export type ProvinceLogoCode = (typeof PROVINCE_LOGO_CODES)[number]

/**
 * Province crest row on Predict (and similar UIs). NC remains in `PROVINCE_LOGO_CODES` for DB / mapping only.
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
export const PROVINCE_LOGO_TITLES: Record<ProvinceLogoCode, string> = {
  WP: 'Western Province',
  KZN: 'KwaZulu-Natal',
  EP: 'Eastern Cape',
  FS: 'Free State / Griquas',
  NC: 'Northern Cape',
  GP: 'Gauteng',
  BUL: 'Blue Bulls',
  LEO: 'Leopards',
  LIM: 'Limpopo',
  PUM: 'Pumas',
  BL: 'Boland',
  SWD: 'South Western Districts',
}

/** Canonical heading for province-filtered list (matches sheet → `game_matches` province labels). */
export const PROVINCE_PREDICT_FILTER_LABEL: Record<ProvinceLogoCode, string> = {
  WP: 'Western Province',
  KZN: 'KwaZulu-Natal',
  EP: 'Eastern Cape',
  FS: 'Free State / Griquas',
  NC: 'Northern Cape',
  GP: 'Gauteng',
  BUL: 'Blue Bulls',
  PUM: 'Pumas',
  LIM: 'Limpopo',
  LEO: 'Leopards',
  BL: 'Boland',
  SWD: 'South Western Districts',
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/** norm(lower) → logo code for Predict filters (`home_team_province` / `away_team_province` only). */
const DISPLAY_KEY_TO_CODE: Map<string, ProvinceLogoCode> = (() => {
  const m = new Map<string, ProvinceLogoCode>()
  const add = (s: string, code: ProvinceLogoCode) => {
    m.set(norm(s), code)
  }
  for (const code of PROVINCE_LOGO_CODES) {
    const label = PROVINCE_PREDICT_FILTER_LABEL[code]
    add(label, code)
    const viaNormalize = normalizeProvinceLabelForGameMatches(label)
    if (viaNormalize) add(viaNormalize, code)
  }
  add('Western Cape', 'WP')
  add('Eastern Province', 'EP')
  add('KwaZulu Natal', 'KZN')
  add('South Western Districts', 'SWD')
  return m
})()

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

/** Multi-word and sensitive phrases first (longer / more specific). */
const NAME_RULES: { test: (n: string) => boolean; code: ProvinceLogoCode }[] = [
  { test: (n) => /south[-\s]western[-\s]districts?/.test(n), code: 'SWD' },
  {
    test: (n) =>
      n.includes('western province') ||
      n.includes('western cape') ||
      /\bwp\b/.test(n),
    code: 'WP',
  },
  { test: (n) => /\bkwa[-\s]?zulu[-\s]?natal\b/.test(n), code: 'KZN' },
  { test: (n) => n.includes('eastern province') || n.includes('eastern cape'), code: 'EP' },
  { test: (n) => n.includes('free state') || /\bgriquas\b/.test(n), code: 'FS' },
  { test: (n) => /\bnorthern cape\b/.test(n), code: 'NC' },
  { test: (n) => /\bgauteng\b/.test(n), code: 'GP' },
  { test: (n) => n.includes('blue bulls'), code: 'BUL' },
  { test: (n) => /\bleopard/.test(n), code: 'LEO' },
  { test: (n) => /\blimpopo\b/.test(n), code: 'LIM' },
  { test: (n) => /\bpumas\b/.test(n), code: 'PUM' },
  { test: (n) => /\bboland\b/.test(n), code: 'BL' },
]

export function getProvinceLogoPath(code: ProvinceLogoCode): string {
  return `/province-logos/${code}.png`
}

export function isKnownProvinceLogoCode(s: string): s is ProvinceLogoCode {
  return (PROVINCE_LOGO_CODES as readonly string[]).includes(s)
}

/** Resolve logo code from a section heading or fixture group display name. */
export function resolveProvinceLogoCodeFromLabel(label: string): ProvinceLogoCode | null {
  const n = norm(label)
  if (!n) return null
  for (const { test, code } of NAME_RULES) {
    if (test(n)) return code
  }
  return null
}

/**
 * Map a single `game_matches.home_team_province` / `away_team_province` value to a logo code.
 * Uses short codes (WP, BL, …), `normalizeProvinceLabelForGameMatches`, and display-name synonyms.
 * Does not use `game_match_groups` / fixture groups.
 */
export function matchProvinceFieldToCode(raw: string | null | undefined): ProvinceLogoCode | null {
  const t = (raw ?? '').trim()
  if (!t) return null

  if (/^[A-Za-z]{2,4}$/.test(t)) {
    const lower = t.toLowerCase()
    if (lower === 'bol') return 'BL'
    const upper = t.toUpperCase()
    if (isKnownProvinceLogoCode(upper)) return upper
    const normalizedShort = normalizeProvinceLabelForGameMatches(t)
    if (normalizedShort) {
      const fromNorm = DISPLAY_KEY_TO_CODE.get(norm(normalizedShort))
      if (fromNorm) return fromNorm
    }
    return null
  }

  const viaCode = normalizeProvinceLabelForGameMatches(t)
  const c1 = DISPLAY_KEY_TO_CODE.get(norm(viaCode))
  if (c1) return c1
  const c2 = DISPLAY_KEY_TO_CODE.get(norm(t))
  if (c2) return c2

  const hyphenSlug = norm(t).replace(/\s+/g, '-')
  const c3 = SLUG_TO_CODE[hyphenSlug]
  if (c3) return c3

  return resolveProvinceLogoCodeFromLabel(t)
}

/** True if either team province field resolves to the same logo `code` (Predict quick filter). */
export function matchBelongsToProvinceLogoCode(
  homeTeamProvince: string | null | undefined,
  awayTeamProvince: string | null | undefined,
  code: ProvinceLogoCode
): boolean {
  return matchProvinceFieldToCode(homeTeamProvince) === code || matchProvinceFieldToCode(awayTeamProvince) === code
}

/**
 * Resolve from fixture group `slug` (preferred) then `name`.
 * Slugs are hyphenated in DB; we normalize to the same keys as `SLUG_TO_CODE`.
 */
export function resolveProvinceLogoCodeFromFixtureGroup(name: string, slug?: string | null): ProvinceLogoCode | null {
  if (slug) {
    const s = norm(slug).replace(/\s+/g, '-')
    if (SLUG_TO_CODE[s]) return SLUG_TO_CODE[s]
    const slugSpaces = norm(slug)
    if (SLUG_TO_CODE[slugSpaces]) return SLUG_TO_CODE[slugSpaces]
  }
  return resolveProvinceLogoCodeFromLabel(name)
}

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
