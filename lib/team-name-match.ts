/**
 * Team name normalization and safe fuzzy matching against DB team names.
 * Used for URL import preview + manual review before insert.
 */

export type TeamRow = { id: number; name: string }

export type TeamMatchMethod = 'exact' | 'normalized' | 'alias' | 'fuzzy' | 'unmatched'

export type TeamMatchResult = {
  matchedTeamId: number | null
  matchedTeamName: string | null
  matchMethod: TeamMatchMethod
  matchConfidence: number | null
  /** Best candidate when fuzzy is in review band or unmatched (for dropdown default). */
  suggestedTeamId: number | null
  suggestedTeamName: string | null
  /** True if confidence is in (0.75, 0.88) — admin should confirm. */
  needsReview: boolean
}

/** Manual nickname → must match a real `teams.name` value after trim. */
const KNOWN_ALIASES: Record<string, string> = {
  affies: 'Afrikaans Hoër Seuns',
  'afrikaanse hoër seuns': 'Afrikaans Hoër Seuns',
  'paarl boys': 'Paarl Boys High',
  'paarl gim': 'Paarl Gimnasium',
  'paarl boys high': 'Paarl Boys High',
  grey: 'Grey College',
  'durban high': 'Durban High',
  oakdale: 'Oakdale',
  outeniqua: 'Outeniqua',
}

const STOP_WORDS = /\b(high school|hoër skool|hoer skool|secondary school|school|college|gymnasium|gimnasium|boys|girls|rugby)\b/gi

export function normalizeTeamKey(name: string): string {
  let s = name.trim().toLowerCase()
  s = s.replace(/&/g, 'and')
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** Stronger normalization for fuzzy / alias (also strips common trailing words). */
export function normalizeTeamKeyLoose(name: string): string {
  let s = normalizeTeamKey(name)
  s = s.replace(STOP_WORDS, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/** 0–1 similarity using normalized Levenshtein ratio. */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeTeamKey(a)
  const nb = normalizeTeamKey(b)
  if (!na.length || !nb.length) return 0
  if (na === nb) return 1
  const d = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return Math.max(0, 1 - d / maxLen)
}

const AUTO_FUZZY = 0.88
const REVIEW_FUZZY_LOW = 0.75

function findTeamByExactName(teams: TeamRow[], name: string): TeamRow | null {
  const key = normalizeTeamKey(name)
  for (const t of teams) {
    if (normalizeTeamKey(t.name) === key) return t
  }
  return null
}

function findTeamByNormalizedLoose(teams: TeamRow[], name: string): TeamRow | null {
  const key = normalizeTeamKeyLoose(name)
  if (!key) return null
  for (const t of teams) {
    if (normalizeTeamKeyLoose(t.name) === key) return t
  }
  return null
}

function resolveAlias(raw: string): string | null {
  const k = normalizeTeamKey(raw)
  if (KNOWN_ALIASES[k]) return KNOWN_ALIASES[k]
  const loose = normalizeTeamKeyLoose(raw)
  if (KNOWN_ALIASES[loose]) return KNOWN_ALIASES[loose]
  return null
}

/**
 * Match a single parsed school name to `teams`.
 * Auto-assigns id only for exact, normalized, alias, or fuzzy >= AUTO_FUZZY.
 */
export function matchTeamName(rawName: string, teams: TeamRow[]): TeamMatchResult {
  const trimmed = rawName.trim()
  if (!trimmed) {
    return {
      matchedTeamId: null,
      matchedTeamName: null,
      matchMethod: 'unmatched',
      matchConfidence: null,
      suggestedTeamId: null,
      suggestedTeamName: null,
      needsReview: true,
    }
  }

  const exact = findTeamByExactName(teams, trimmed)
  if (exact) {
    return {
      matchedTeamId: exact.id,
      matchedTeamName: exact.name,
      matchMethod: 'exact',
      matchConfidence: 1,
      suggestedTeamId: exact.id,
      suggestedTeamName: exact.name,
      needsReview: false,
    }
  }

  const normalizedHit = findTeamByNormalizedLoose(teams, trimmed)
  if (normalizedHit) {
    return {
      matchedTeamId: normalizedHit.id,
      matchedTeamName: normalizedHit.name,
      matchMethod: 'normalized',
      matchConfidence: 1,
      suggestedTeamId: normalizedHit.id,
      suggestedTeamName: normalizedHit.name,
      needsReview: false,
    }
  }

  const aliasTarget = resolveAlias(trimmed)
  if (aliasTarget) {
    const byAlias = findTeamByExactName(teams, aliasTarget)
    if (byAlias) {
      return {
        matchedTeamId: byAlias.id,
        matchedTeamName: byAlias.name,
        matchMethod: 'alias',
        matchConfidence: 1,
        suggestedTeamId: byAlias.id,
        suggestedTeamName: byAlias.name,
        needsReview: false,
      }
    }
  }

  let best: { team: TeamRow; score: number } | null = null
  let second: { team: TeamRow; score: number } | null = null

  for (const t of teams) {
    const score = stringSimilarity(trimmed, t.name)
    if (!best || score > best.score) {
      second = best
      best = { team: t, score }
    } else if (!second || score > second.score) {
      second = { team: t, score }
    }
  }

  if (!best || best.score < REVIEW_FUZZY_LOW) {
    return {
      matchedTeamId: null,
      matchedTeamName: null,
      matchMethod: 'unmatched',
      matchConfidence: best?.score ?? null,
      suggestedTeamId: best?.team.id ?? null,
      suggestedTeamName: best?.team.name ?? null,
      needsReview: true,
    }
  }

  if (best.score >= AUTO_FUZZY) {
    const ambiguous =
      second && second.score >= AUTO_FUZZY - 0.05 && second.team.id !== best.team.id
    if (ambiguous) {
      return {
        matchedTeamId: null,
        matchedTeamName: null,
        matchMethod: 'fuzzy',
        matchConfidence: best.score,
        suggestedTeamId: best.team.id,
        suggestedTeamName: best.team.name,
        needsReview: true,
      }
    }
    return {
      matchedTeamId: best.team.id,
      matchedTeamName: best.team.name,
      matchMethod: 'fuzzy',
      matchConfidence: best.score,
      suggestedTeamId: best.team.id,
      suggestedTeamName: best.team.name,
      needsReview: false,
    }
  }

  return {
    matchedTeamId: null,
    matchedTeamName: null,
    matchMethod: 'fuzzy',
    matchConfidence: best.score,
    suggestedTeamId: best.team.id,
    suggestedTeamName: best.team.name,
    needsReview: true,
  }
}
