import type { CSSProperties } from 'react'
import type { MemoryMapBranding } from '@/lib/memory-map/types'

export const MEMORY_MAP_DEFAULT_THEME = {
  background: '#05080D',
  surface: '#0D1117',
  surfaceCard: '#111827',
  border: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  muted: '#9CA3AF',
  primary: '#FFD400',
  primaryText: '#050505',
  secondary: '#005DAA',
  secondaryText: '#FFFFFF',
  accent: '#FFD400',
  danger: '#EF4444',
  success: '#22C55E',
} as const

export const PUBLIC_MEMORY_MAP_DEFAULTS = {
  primary: MEMORY_MAP_DEFAULT_THEME.primary,
  secondary: MEMORY_MAP_DEFAULT_THEME.secondary,
  accent: MEMORY_MAP_DEFAULT_THEME.accent,
  surface: MEMORY_MAP_DEFAULT_THEME.surfaceCard,
} as const

export type PublicMemoryMapTheme = {
  primary: string
  secondary: string
  accent: string
  surface: string
  primaryText: string
  secondaryText: string
}

/** Pick black or white text for a solid hex background. */
export function getContrastText(hex: string): '#000000' | '#ffffff' {
  if (!hex) return '#000000'
  const clean = hex.replace('#', '').trim()
  if (clean.length !== 6 && clean.length !== 3) return '#000000'
  const full =
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.substring(0, 2), 16)
  const g = parseInt(full.substring(2, 4), 16)
  const b = parseInt(full.substring(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#000000'
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#000000' : '#ffffff'
}

function isValidHexColor(hex: string | null | undefined): hex is string {
  if (!hex || hex === 'transparent') return false
  const clean = hex.replace('#', '').trim()
  return /^[0-9a-fA-F]{6}$/.test(clean) || /^[0-9a-fA-F]{3}$/.test(clean)
}

function normalizeHex(hex: string): string {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    return `#${clean.split('').map((c) => c + c).join('')}`
  }
  return `#${clean}`
}

/** Resolved branding colours for the public Memory Map UI. */
export function resolvePublicMemoryMapTheme(
  branding?: Partial<MemoryMapBranding> | null
): PublicMemoryMapTheme {
  const primary = isValidHexColor(branding?.primary_color)
    ? normalizeHex(branding.primary_color)
    : PUBLIC_MEMORY_MAP_DEFAULTS.primary

  const secondary = isValidHexColor(branding?.secondary_color)
    ? normalizeHex(branding.secondary_color)
    : PUBLIC_MEMORY_MAP_DEFAULTS.secondary

  const accent = isValidHexColor(branding?.accent_color)
    ? normalizeHex(branding.accent_color)
    : isValidHexColor(branding?.primary_color)
      ? normalizeHex(branding.primary_color)
      : PUBLIC_MEMORY_MAP_DEFAULTS.accent

  return {
    primary,
    secondary,
    accent,
    surface: PUBLIC_MEMORY_MAP_DEFAULTS.surface,
    primaryText: getContrastText(primary),
    secondaryText: getContrastText(secondary),
  }
}

export function memoryMapThemeVars(branding?: Partial<MemoryMapBranding> | null): Record<string, string> {
  const theme = resolvePublicMemoryMapTheme(branding)
  const secondaryCss = isValidHexColor(branding?.secondary_color)
    ? theme.secondary
    : 'transparent'

  return {
    ['--mm-bg' as string]: MEMORY_MAP_DEFAULT_THEME.background,
    ['--mm-surface' as string]: MEMORY_MAP_DEFAULT_THEME.surface,
    ['--mm-surface-card' as string]: theme.surface,
    ['--mm-border' as string]: MEMORY_MAP_DEFAULT_THEME.border,
    ['--mm-text' as string]: MEMORY_MAP_DEFAULT_THEME.text,
    ['--mm-muted' as string]: MEMORY_MAP_DEFAULT_THEME.muted,
    ['--mm-primary' as string]: theme.primary,
    ['--mm-primary-text' as string]: theme.primaryText,
    ['--mm-secondary' as string]: secondaryCss,
    ['--mm-secondary-text' as string]:
      branding?.secondary_text_color ?? MEMORY_MAP_DEFAULT_THEME.secondaryText,
    ['--mm-accent' as string]: theme.accent,
    ['--mm-danger' as string]: MEMORY_MAP_DEFAULT_THEME.danger,
    ['--mm-success' as string]: MEMORY_MAP_DEFAULT_THEME.success,
  }
}

export function mmPrimaryButtonStyle(theme: PublicMemoryMapTheme): CSSProperties {
  return {
    backgroundColor: theme.primary,
    color: theme.primaryText,
  }
}

export function mmActiveTabStyle(theme: PublicMemoryMapTheme): CSSProperties {
  return mmPrimaryButtonStyle(theme)
}

export function mmOutlineButtonStyle(theme: PublicMemoryMapTheme): CSSProperties {
  return {
    borderColor: theme.primary,
    color: theme.primary,
  }
}

export function mmSelectedAreaStyle(theme: PublicMemoryMapTheme): CSSProperties {
  return {
    borderColor: theme.primary,
    boxShadow: `0 0 0 1px ${theme.primary}`,
  }
}

export function mmStepCircleStyle(theme: PublicMemoryMapTheme): CSSProperties {
  return {
    backgroundColor: theme.primary,
    color: theme.primaryText,
  }
}

export function mmPinBadgeStyle(
  theme: PublicMemoryMapTheme,
  pinColour?: string | null
): CSSProperties {
  const bg = isValidHexColor(pinColour) ? normalizeHex(pinColour!) : theme.primary
  return {
    backgroundColor: bg,
    color: getContrastText(bg),
  }
}
