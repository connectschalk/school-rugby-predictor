import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getNovaDemoBranding,
  isNovaDemoEnabled,
  isNovaDemoEnvEnabled,
  isNovaDemoQueryAllowed,
  resolveNovaDemoMode,
  withNovaDemoParam,
} from './nova-demo'

describe('nova-demo activation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('remains disabled by default', () => {
    vi.stubEnv('NEXT_PUBLIC_NOVA_AD_DEMO', undefined)
    expect(isNovaDemoEnvEnabled()).toBe(false)
    expect(isNovaDemoEnabled()).toBe(false)
    expect(resolveNovaDemoMode(null)).toBe(false)
    expect(resolveNovaDemoMode(new URLSearchParams())).toBe(false)
  })

  it('enables via NEXT_PUBLIC_NOVA_AD_DEMO=true', () => {
    vi.stubEnv('NEXT_PUBLIC_NOVA_AD_DEMO', 'true')
    expect(isNovaDemoEnvEnabled()).toBe(true)
    expect(resolveNovaDemoMode(null)).toBe(true)
  })

  it('enables via ?novaDemo=1 when query activation is allowed', () => {
    vi.stubEnv('NEXT_PUBLIC_NOVA_AD_DEMO', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    expect(isNovaDemoQueryAllowed()).toBe(true)
    expect(resolveNovaDemoMode(new URLSearchParams('novaDemo=1'))).toBe(true)
  })

  it('blocks query activation in production unless explicitly allowed', () => {
    vi.stubEnv('NEXT_PUBLIC_NOVA_AD_DEMO', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_NOVA_DEMO_QUERY_ALLOWED', undefined)
    expect(isNovaDemoQueryAllowed()).toBe(false)
    expect(resolveNovaDemoMode(new URLSearchParams('novaDemo=1'))).toBe(false)

    vi.stubEnv('NEXT_PUBLIC_NOVA_DEMO_QUERY_ALLOWED', 'true')
    expect(resolveNovaDemoMode(new URLSearchParams('novaDemo=1'))).toBe(true)
  })

  it('returns Nova branding helpers without inventing a logo asset', () => {
    const branding = getNovaDemoBranding()
    expect(branding.productName).toMatch(/Nova/)
    expect(branding.poweredBy).toMatch(/NextPlay/)
    expect(branding.logoMode).toBe('text')
    expect(branding.badgeLabel).toMatch(/demo/i)
  })

  it('appends novaDemo param when demo active', () => {
    expect(withNovaDemoParam('/competitions/nextplay-schools', true)).toContain('novaDemo=1')
    expect(withNovaDemoParam('/competitions/nextplay-schools', false)).toBe(
      '/competitions/nextplay-schools'
    )
  })
})
