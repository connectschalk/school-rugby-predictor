import { describe, expect, it } from 'vitest'
import { createSignupPlaceholderPassword } from './auth-signup-placeholder'

describe('auth-signup-placeholder', () => {
  it('generates a long unique placeholder password', () => {
    const a = createSignupPlaceholderPassword()
    const b = createSignupPlaceholderPassword()
    expect(a.length).toBeGreaterThan(20)
    expect(a).not.toBe(b)
    expect(a.startsWith('Np!')).toBe(true)
  })
})
