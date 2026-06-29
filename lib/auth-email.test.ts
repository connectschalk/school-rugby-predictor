import { describe, expect, it } from 'vitest'
import { readSignupProduct, signupProductMetadata } from './auth-email'
import {
  MEMORY_MAP_CONFIRM_SIGNUP_SUBJECT,
  memoryMapConfirmSignupHtml,
  predictorConfirmSignupHtml,
  supabaseConfirmSignupHtmlTemplate,
  supabaseConfirmSignupSubjectTemplate,
} from './auth-email-templates'

describe('auth-email signup product', () => {
  it('reads memory_map from user metadata', () => {
    const user = {
      id: 'u1',
      user_metadata: { signup_product: 'memory_map' },
    } as import('@supabase/supabase-js').User
    expect(readSignupProduct(user)).toBe('memory_map')
  })

  it('defaults to predictor when metadata is missing', () => {
    expect(readSignupProduct({ id: 'u1', user_metadata: {} } as import('@supabase/supabase-js').User)).toBe(
      'predictor'
    )
  })

  it('builds signup metadata payload', () => {
    expect(signupProductMetadata('memory_map')).toEqual({ signup_product: 'memory_map' })
  })
})

describe('auth-email templates', () => {
  it('memory map template uses Memory Map branding and copy', () => {
    const html = memoryMapConfirmSignupHtml('https://example.com/confirm')
    expect(html).toContain('Welcome to NextPlay Memory Map')
    expect(html).toContain('/memory-map/default-memory-map-logo.png')
    expect(html).toContain('Verify account and continue')
    expect(html).toContain('stories, photos and videos')
    expect(html).not.toContain('leaderboards')
    expect(html).not.toContain('match banter')
    expect(html).not.toContain('nextplay-predictor')
  })

  it('predictor template keeps predictor copy', () => {
    const html = predictorConfirmSignupHtml()
    expect(html).toContain('NextPlay Predictor')
    expect(html).toContain('leaderboards')
  })

  it('supabase combined template branches on signup_product', () => {
    const subject = supabaseConfirmSignupSubjectTemplate()
    const body = supabaseConfirmSignupHtmlTemplate()
    expect(subject).toContain(MEMORY_MAP_CONFIRM_SIGNUP_SUBJECT)
    expect(subject).toContain('signup_product')
    expect(body).toContain('{{ if eq .Data.signup_product "memory_map" }}')
    expect(body).toContain('Welcome to NextPlay Memory Map')
    expect(body).toContain('Welcome to NextPlay Predictor')
    expect(body).toContain('{{ .ConfirmationURL }}')
  })
})
