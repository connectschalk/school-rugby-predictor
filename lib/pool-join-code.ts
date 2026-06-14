/** Pool short join codes — stored lowercase; display uppercase in UI. */

export const POOL_JOIN_CODE_MIN = 4
export const POOL_JOIN_CODE_MAX = 20
export const POOL_JOIN_CODE_REGEX = /^[a-z0-9]{4,20}$/

export const POOL_JOIN_CODE_TAKEN_MESSAGE =
  'This pool code is already taken. Please choose another.'

export const POOL_JOIN_CODE_INVALID_MESSAGE =
  'Pool code must be 4–20 letters or numbers (no spaces).'

/** Normalize user input for storage / RPC (lowercase, strip spaces). */
export function normalizePoolJoinCodeInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

/** Uppercase display label, e.g. soccer1 → SOCCER1 */
export function formatPoolJoinCodeDisplay(code: string | null | undefined): string {
  const c = (code ?? '').trim()
  return c ? c.toUpperCase() : ''
}

export function validatePoolJoinCodeInput(raw: string): string | null {
  const normalized = normalizePoolJoinCodeInput(raw)
  if (!normalized) return null
  if (!POOL_JOIN_CODE_REGEX.test(normalized)) {
    return POOL_JOIN_CODE_INVALID_MESSAGE
  }
  return null
}

export function isPoolJoinCodeTakenError(message: string): boolean {
  return message.includes('already taken')
}
