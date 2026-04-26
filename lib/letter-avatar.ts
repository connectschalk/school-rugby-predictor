/** Default circle background when colour not set. */
export const DEFAULT_AVATAR_COLOUR = '#111318'

export type AvatarColourOption = {
  /** Display / accessibility name */
  label: string
  value: string
}

/**
 * Preset avatar backgrounds only (no free-form colour). UI + `isPaletteAvatarColour` guard saves;
 * `resolveAvatarColour` still accepts any stored #RRGGBB for legacy rows.
 */
export const AVATAR_COLOUR_OPTIONS: readonly AvatarColourOption[] = [
  { label: 'Black', value: '#111318' },
  { label: 'Dark navy', value: '#0f172a' },
  { label: 'Navy', value: '#1e3a5f' },
  { label: 'Royal blue', value: '#1d4ed8' },
  { label: 'Bright blue', value: '#2563eb' },
  { label: 'Sky blue', value: '#38bdf8' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Turquoise', value: '#14b8a6' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Deep green', value: '#14532d' },
  { label: 'Forest green', value: '#166534' },
  { label: 'Olive green', value: '#4d7c0f' },
  { label: 'Purple', value: '#6d28d9' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Lavender', value: '#c4b5fd' },
  { label: 'Burgundy', value: '#7f1d1d' },
  { label: 'Maroon', value: '#881337' },
  { label: 'Red', value: '#b91c1c' },
  { label: 'Bright red', value: '#dc2626' },
  { label: 'Coral', value: '#fb7185' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Gold', value: '#ca8a04' },
  { label: 'Brown', value: '#78350f' },
  { label: 'Beige / blue-grey', value: '#cfd8e3' },
  { label: 'Grey', value: '#6b7280' },
  { label: 'Slate', value: '#475569' },
  { label: 'White', value: '#ffffff' },
]

const ALLOWED_HEX = new Set(AVATAR_COLOUR_OPTIONS.map((o) => o.value.toLowerCase()))

export function isPaletteAvatarColour(hex: string): boolean {
  return ALLOWED_HEX.has(hex.trim().toLowerCase())
}

/** Normalize to #RRGGBB or null if invalid. */
export function parseAvatarColourHex(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t || !/^#[0-9A-Fa-f]{6}$/.test(t)) return null
  return `#${t.slice(1).toLowerCase()}`
}

export function resolveAvatarColour(stored: string | null | undefined): string {
  const parsed = parseAvatarColourHex(stored)
  return parsed ?? DEFAULT_AVATAR_COLOUR
}

/** Letter colour on circle: dark text on light backgrounds, white otherwise. */
export function pickAvatarLetterTextColor(bgHex: string): '#111318' | '#ffffff' {
  const parsed = parseAvatarColourHex(bgHex) ?? DEFAULT_AVATAR_COLOUR
  const r = parseInt(parsed.slice(1, 3), 16) / 255
  const g = parseInt(parsed.slice(3, 5), 16) / 255
  const b = parseInt(parsed.slice(5, 7), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B
  return luminance > 0.55 ? '#111318' : '#ffffff'
}

const LETTER_RE = /^[A-Z]$/

export function normalizeAvatarLetter(raw: string | null | undefined): string | null {
  const u = raw?.trim().toUpperCase()
  if (!u || !LETTER_RE.test(u)) return null
  return u
}

/**
 * Fallback order: stored letter → first letter first_name → first letter display_name → P.
 */
export function resolveAvatarLetter(
  storedLetter: string | null | undefined,
  firstName: string | null | undefined,
  displayName: string | null | undefined
): string {
  const fromStore = normalizeAvatarLetter(storedLetter)
  if (fromStore) return fromStore

  const pick = (s: string | null | undefined) => {
    const t = s?.trim()
    if (!t) return null
    const ch = t.charAt(0).toUpperCase()
    return LETTER_RE.test(ch) ? ch : null
  }

  return pick(firstName) ?? pick(displayName) ?? 'P'
}

/**
 * When `avatar_url` is set (static app path, full URL, or legacy upload), show that image
 * instead of the letter circle. Letter/colour can still be stored for if the URL is cleared later.
 */
export function shouldUseLegacyAvatarImage(avatarUrl: string | null | undefined): boolean {
  const url = avatarUrl?.trim()
  return Boolean(url)
}
