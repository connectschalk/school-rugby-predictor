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
  secondary: 'transparent',
  secondaryText: '#FFFFFF',
  accent: '#FFD400',
  danger: '#EF4444',
  success: '#22C55E',
} as const

export function memoryMapThemeVars(branding?: Partial<MemoryMapBranding> | null): Record<string, string> {
  return {
    ['--mm-bg' as string]: MEMORY_MAP_DEFAULT_THEME.background,
    ['--mm-surface' as string]: MEMORY_MAP_DEFAULT_THEME.surface,
    ['--mm-surface-card' as string]: MEMORY_MAP_DEFAULT_THEME.surfaceCard,
    ['--mm-border' as string]: MEMORY_MAP_DEFAULT_THEME.border,
    ['--mm-text' as string]: MEMORY_MAP_DEFAULT_THEME.text,
    ['--mm-muted' as string]: MEMORY_MAP_DEFAULT_THEME.muted,
    ['--mm-primary' as string]: branding?.primary_color ?? MEMORY_MAP_DEFAULT_THEME.primary,
    ['--mm-primary-text' as string]: branding?.primary_text_color ?? MEMORY_MAP_DEFAULT_THEME.primaryText,
    ['--mm-secondary' as string]: branding?.secondary_color ?? MEMORY_MAP_DEFAULT_THEME.secondary,
    ['--mm-secondary-text' as string]: branding?.secondary_text_color ?? MEMORY_MAP_DEFAULT_THEME.secondaryText,
    ['--mm-accent' as string]: branding?.accent_color ?? MEMORY_MAP_DEFAULT_THEME.accent,
    ['--mm-danger' as string]: MEMORY_MAP_DEFAULT_THEME.danger,
    ['--mm-success' as string]: MEMORY_MAP_DEFAULT_THEME.success,
  }
}
