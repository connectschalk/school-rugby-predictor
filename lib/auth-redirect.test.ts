import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthCallbackUrl,
  buildMemoryMapEmailConfirmCallbackUrl,
  resolveEmailConfirmErrorRedirect,
  resolveEmailConfirmRedirect,
  shouldRetainSessionAfterEmailConfirm,
} from './auth-redirect'
import {
  buildMemoryMapCreatePasswordHref,
  isMemoryMapInvitePath,
} from './memory-map/auth-routes'

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrl: () => 'https://www.thenextplay.co.za',
}))

describe('auth-redirect', () => {
  it('builds auth callback URLs from env base', () => {
    expect(buildAuthCallbackUrl('/memory-map')).toBe(
      'https://www.thenextplay.co.za/auth/callback?next=%2Fmemory-map'
    )
  })

  it('builds Memory Map confirm callback via create-password hop', () => {
    const url = buildMemoryMapEmailConfirmCallbackUrl('/memory-map/invite/abc')
    expect(url).toContain('/auth/callback?next=')
    expect(url).toContain(encodeURIComponent('/memory-map/auth/create-password?next='))
    expect(url).toContain(encodeURIComponent(encodeURIComponent('/memory-map/invite/abc')))
  })

  it('resolves Memory Map create-password next after email confirm', () => {
    const next = encodeURIComponent('/memory-map/auth/create-password?next=%2Fmemory-map%2Finvite%2Fabc')
    expect(resolveEmailConfirmRedirect(next)).toBe(
      '/memory-map/auth/create-password?next=%2Fmemory-map%2Finvite%2Fabc'
    )
  })

  it('retains session for create-password redirect only', () => {
    expect(shouldRetainSessionAfterEmailConfirm('/memory-map/auth/create-password?next=%2Fmemory-map')).toBe(true)
    expect(shouldRetainSessionAfterEmailConfirm('/memory-map/auth/sign-in')).toBe(false)
  })

  it('resolves Predictor login next with confirmed flag', () => {
    expect(resolveEmailConfirmRedirect(encodeURIComponent('/login'))).toBe('/login?confirmed=1')
  })

  it('defaults Memory Map users to create-password', () => {
    const user = { id: 'u1', user_metadata: { signup_product: 'memory_map' } } as import('@supabase/supabase-js').User
    expect(resolveEmailConfirmRedirect(null, user)).toBe(
      '/memory-map/auth/create-password?next=%2Fmemory-map'
    )
  })

  it('defaults Predictor users to login', () => {
    expect(resolveEmailConfirmRedirect(null)).toBe('/login?confirmed=1')
  })

  it('routes confirm errors to memory-map sign-in when next is memory map', () => {
    const next = encodeURIComponent('/memory-map/auth/create-password')
    expect(resolveEmailConfirmErrorRedirect(next)).toBe('/memory-map/auth/sign-in')
  })
})

describe('memory-map auth-routes', () => {
  it('detects invite paths', () => {
    expect(isMemoryMapInvitePath('/memory-map/invite/abc123')).toBe(true)
    expect(isMemoryMapInvitePath('/memory-map/auth/sign-in')).toBe(false)
  })

  it('preserves invite token in create-password href', () => {
    expect(buildMemoryMapCreatePasswordHref('/memory-map/invite/abc123')).toBe(
      '/memory-map/auth/create-password?next=%2Fmemory-map%2Finvite%2Fabc123'
    )
  })
})
