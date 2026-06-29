import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthCallbackUrl,
  buildMemoryMapEmailConfirmCallbackUrl,
  resolveEmailConfirmErrorRedirect,
  resolveEmailConfirmRedirect,
} from './auth-redirect'

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrl: () => 'https://www.thenextplay.co.za',
}))

describe('auth-redirect', () => {
  it('builds auth callback URLs from env base', () => {
    expect(buildAuthCallbackUrl('/memory-map')).toBe(
      'https://www.thenextplay.co.za/auth/callback?next=%2Fmemory-map'
    )
  })

  it('builds Memory Map confirm callback via sign-in hop', () => {
    const url = buildMemoryMapEmailConfirmCallbackUrl('/memory-map/invite/abc')
    expect(url).toContain('/auth/callback?next=')
    expect(url).toContain(encodeURIComponent('/memory-map/auth/sign-in?next='))
    expect(url).toContain(encodeURIComponent(encodeURIComponent('/memory-map/invite/abc')))
  })

  it('resolves Memory Map next after email confirm', () => {
    const next = encodeURIComponent('/memory-map/auth/sign-in?next=%2Fmemory-map%2Finvite%2Fabc')
    expect(resolveEmailConfirmRedirect(next)).toBe(
      '/memory-map/auth/sign-in?next=%2Fmemory-map%2Finvite%2Fabc'
    )
  })

  it('resolves Predictor login next with confirmed flag', () => {
    expect(resolveEmailConfirmRedirect(encodeURIComponent('/login'))).toBe('/login?confirmed=1')
  })

  it('defaults Memory Map users to memory-map sign-in', () => {
    const user = { id: 'u1', user_metadata: { signup_product: 'memory_map' } } as import('@supabase/supabase-js').User
    expect(resolveEmailConfirmRedirect(null, user)).toBe('/memory-map/auth/sign-in?confirmed=1')
  })

  it('defaults Predictor users to login', () => {
    expect(resolveEmailConfirmRedirect(null)).toBe('/login?confirmed=1')
  })

  it('routes confirm errors to memory-map sign-in when next is memory map', () => {
    const next = encodeURIComponent('/memory-map/auth/sign-in')
    expect(resolveEmailConfirmErrorRedirect(next)).toBe('/memory-map/auth/sign-in')
  })
})
