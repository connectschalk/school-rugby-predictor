import { describe, expect, it } from 'vitest'
import {
  getContrastText,
  memoryMapThemeVars,
  PUBLIC_MEMORY_MAP_DEFAULTS,
  resolvePublicMemoryMapTheme,
} from './theme'

describe('memory-map theme', () => {
  it('returns default colours when branding is missing', () => {
    const theme = resolvePublicMemoryMapTheme(null)
    expect(theme.primary).toBe(PUBLIC_MEMORY_MAP_DEFAULTS.primary)
    expect(theme.secondary).toBe(PUBLIC_MEMORY_MAP_DEFAULTS.secondary)
    expect(theme.accent).toBe(PUBLIC_MEMORY_MAP_DEFAULTS.accent)
    expect(theme.primaryText).toBe('#000000')
  })

  it('uses map branding colours when set', () => {
    const theme = resolvePublicMemoryMapTheme({
      primary_color: '#8B0000',
      secondary_color: '#004225',
      accent_color: '#C0C0C0',
      primary_text_color: '#fff',
      secondary_text_color: '#fff',
    })
    expect(theme.primary).toBe('#8B0000')
    expect(theme.secondary).toBe('#004225')
    expect(theme.accent).toBe('#C0C0C0')
    expect(theme.primaryText).toBe('#ffffff')
  })

  it('falls back accent to primary when accent is missing', () => {
    const theme = resolvePublicMemoryMapTheme({ primary_color: '#336699' })
    expect(theme.accent).toBe('#336699')
  })

  it('computes contrast text for light and dark backgrounds', () => {
    expect(getContrastText('#FFD400')).toBe('#000000')
    expect(getContrastText('#005DAA')).toBe('#ffffff')
    expect(getContrastText('')).toBe('#000000')
  })

  it('sets CSS variables from resolved theme', () => {
    const vars = memoryMapThemeVars({ primary_color: '#8B0000', accent_color: '#C0C0C0' })
    expect(vars['--mm-primary']).toBe('#8B0000')
    expect(vars['--mm-accent']).toBe('#C0C0C0')
    expect(vars['--mm-primary-text']).toBe('#ffffff')
  })
})
