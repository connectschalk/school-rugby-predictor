/**
 * Teams Google Sheet is the master province reference (`teams.province` + `canonical_name`).
 * Pool directories, Predict filters, and previews must normalize any label or short code to a
 * canonical province code before comparing — never match raw display strings alone.
 */

import {
  normalizeProvinceLabelForGameMatches,
  PROVINCE_CODE_TO_CANONICAL_SLUG,
  PROVINCE_CODE_TO_GAME_MATCHES_DISPLAY_NAME,
} from './fixture-group-resolve'

/** Canonical province/union codes stored on the Teams tab (and on `game_matches` team province fields). */
export const TEAMS_SHEET_PROVINCE_CODES = [
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
  'NC',
] as const

export type TeamsSheetProvinceCode = (typeof TEAMS_SHEET_PROVINCE_CODES)[number]

const CODE_SET = new Set<string>(TEAMS_SHEET_PROVINCE_CODES)

/** Display names aligned with the sheet and Predict UI (WP → Western Province, LEO → Leopards, not Lions). */
export const TEAMS_SHEET_CODE_TO_DISPLAY_NAME: Record<TeamsSheetProvinceCode, string> = {
  WP: 'Western Province',
  KZN: 'KwaZulu-Natal',
  EP: 'Eastern Cape',
  FS: 'Free State / Griquas',
  GP: 'Gauteng',
  BUL: 'Blue Bulls',
  PUM: 'Pumas',
  LIM: 'Limpopo',
  LEO: 'Leopards',
  BL: 'Boland',
  SWD: 'South Western Districts',
  NC: 'Northern Cape',
}

export function isTeamsSheetProvinceCode(s: string): s is TeamsSheetProvinceCode {
  return CODE_SET.has(s)
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/** norm(lower) → canonical code */
const DISPLAY_KEY_TO_CODE: Map<string, TeamsSheetProvinceCode> = (() => {
  const m = new Map<string, TeamsSheetProvinceCode>()
  const add = (s: string, code: TeamsSheetProvinceCode) => {
    m.set(norm(s), code)
  }
  for (const code of TEAMS_SHEET_PROVINCE_CODES) {
    const label = TEAMS_SHEET_CODE_TO_DISPLAY_NAME[code]
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

const SLUG_TO_CODE: Record<string, TeamsSheetProvinceCode> = {
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
  'free-state-griquas': 'FS',
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

/**
 * Ordered rules: longer / more specific first. LEO = Leopards only; “Lions” maps to GP (Gauteng schools).
 * Noordvaal is not a province — never return a code for it.
 */
const NAME_RULES: { test: (n: string) => boolean; code: TeamsSheetProvinceCode }[] = [
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
  { test: (n) => n.includes('blue bull'), code: 'BUL' },
  { test: (n) => /\blions\b/.test(n), code: 'GP' },
  { test: (n) => /\bleopard/.test(n), code: 'LEO' },
  { test: (n) => /\blimpopo\b/.test(n), code: 'LIM' },
  { test: (n) => /\bpumas\b/.test(n), code: 'PUM' },
  { test: (n) => /\bboland\b/.test(n), code: 'BL' },
]

export function resolveProvinceCodeFromLabel(label: string): TeamsSheetProvinceCode | null {
  const n = norm(label)
  if (!n) return null
  if (n === 'noordvaal' || n.includes('noordvaal')) return null
  for (const { test, code } of NAME_RULES) {
    if (test(n)) return code
  }
  return null
}

/**
 * Normalize a Teams-tab or `game_matches` province value to a canonical code (WP, BUL, …).
 * Accepts short codes, display names, and common synonyms.
 */
export function normalizeProvinceCode(raw: string | null | undefined): TeamsSheetProvinceCode | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const n = norm(t)
  if (n === 'noordvaal' || n.includes('noordvaal')) return null

  if (/^[A-Za-z]{2,4}$/.test(t)) {
    const lower = t.toLowerCase()
    if (lower === 'bol') return 'BL'
    const upper = t.toUpperCase()
    if (isTeamsSheetProvinceCode(upper)) return upper
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

  return resolveProvinceCodeFromLabel(t)
}

export function getProvinceDisplayName(code: TeamsSheetProvinceCode): string {
  return TEAMS_SHEET_CODE_TO_DISPLAY_NAME[code]
}

export function getProvinceLogo(code: TeamsSheetProvinceCode): string {
  return `/province-logos/${code}.png`
}

/**
 * Teams with `province` (sheet) normalizing to `code`. Uses `pickDisplay` for the returned label (e.g. canonical_name).
 */
export function getTeamsForProvince<T extends { province?: string | null }>(
  code: TeamsSheetProvinceCode,
  teams: T[],
  pickDisplay: (row: T) => string
): string[] {
  const out = new Set<string>()
  for (const row of teams) {
    if (normalizeProvinceCode(row.province) === code) {
      const d = pickDisplay(row).trim()
      if (d) out.add(d)
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/** Map `fixture_groups.slug` (e.g. blue-bulls) to Teams sheet codes (e.g. BUL). */
export function provinceCodesForFixtureGroupSlug(slug: string): TeamsSheetProvinceCode[] {
  const key = slug.trim().toLowerCase()
  if (!key || key === 'noordvaal') return []
  for (const [codeLower, canonSlug] of Object.entries(PROVINCE_CODE_TO_CANONICAL_SLUG)) {
    if (canonSlug === key) {
      const up = codeLower.toUpperCase()
      if (isTeamsSheetProvinceCode(up)) return [up]
    }
  }
  const fromSlugMap = SLUG_TO_CODE[key]
  if (fromSlugMap) return [fromSlugMap]
  return []
}

/** Either home or away `game_matches` province field normalizes to `code`. */
export function matchBelongsToProvinceCode(
  homeTeamProvince: string | null | undefined,
  awayTeamProvince: string | null | undefined,
  code: TeamsSheetProvinceCode
): boolean {
  return normalizeProvinceCode(homeTeamProvince) === code || normalizeProvinceCode(awayTeamProvince) === code
}
