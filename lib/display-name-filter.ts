/**
 * SA-focused display name moderation (English + Afrikaans).
 * Keep in sync with `normalize_display_name_for_moderation` in Supabase.
 */

const BANNED_DISPLAY_NAME_WORDS = [
  // English
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'cunt',
  // Afrikaans
  'poes',
  'fok',
  'fokken',
  'kak',
  'doos',
  'piel',
  'naai',
] as const

/** User-facing copy when a name is blocked (never echo the matched word). */
export const DISPLAY_NAME_NOT_ALLOWED_MESSAGE =
  "That display name isn't allowed. Try something more creative."

/** Postgres trigger / check_violation uses this marker (no banned words in text). */
export const DISPLAY_NAME_DB_ERROR_MARKER = 'DISPLAY_NAME_NOT_ALLOWED'

export function isDisplayNamePolicyDbError(message: string | undefined | null): boolean {
  if (!message) return false
  return (
    message.includes(DISPLAY_NAME_DB_ERROR_MARKER) ||
    message.toLowerCase().includes('display_name_not_allowed') ||
    message.includes('23514')
  )
}

/**
 * Lowercase, strip spaces, apply leet-ish substitutions, then letters only (a–z).
 * Mirrors `public.normalize_display_name_for_moderation`.
 */
export function normalizeDisplayNameForModeration(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null

  const subMap: Record<string, string> = {
    '@': 'a',
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
  }
  let out = ''
  for (const ch of s) {
    out += subMap[ch] ?? ch
  }
  out = out.replace(/[^a-z]/g, '')
  return out.length > 0 ? out : null
}

/** True if normalized input contains any active banned substring (same logic as DB). */
export function containsBannedDisplayNameWord(input: string): boolean {
  const n = normalizeDisplayNameForModeration(input)
  if (!n) return false
  for (const w of BANNED_DISPLAY_NAME_WORDS) {
    if (n.includes(w)) return true
  }
  return false
}

export type DisplayNameValidation =
  | { ok: true }
  | { ok: false; message: typeof DISPLAY_NAME_NOT_ALLOWED_MESSAGE }

/**
 * Profanity / banned-word check only. Empty input is `ok: true` (callers enforce required separately).
 */
export function validateDisplayName(input: string | null | undefined): DisplayNameValidation {
  const t = (input ?? '').trim()
  if (!t) return { ok: true }
  if (containsBannedDisplayNameWord(t)) {
    return { ok: false, message: DISPLAY_NAME_NOT_ALLOWED_MESSAGE }
  }
  return { ok: true }
}
