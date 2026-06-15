import { describe, expect, it } from 'vitest'
import {
  buildLoginHref,
  buildSignupHref,
  isAuthEntryPath,
  POST_AUTH_DEFAULT_PATH,
  resolvePostAuthRedirect,
  safeInternalReturnPath,
} from './auth-return-path'

describe('safeInternalReturnPath', () => {
  it('accepts same-site relative paths', () => {
    expect(safeInternalReturnPath('/competitions/craven-week/predict')).toBe(
      '/competitions/craven-week/predict'
    )
  })

  it('rejects external and protocol-relative URLs', () => {
    expect(safeInternalReturnPath('https://evil.test')).toBeNull()
    expect(safeInternalReturnPath('//evil.test')).toBeNull()
  })
})

describe('resolvePostAuthRedirect', () => {
  it('uses deep link when provided', () => {
    expect(resolvePostAuthRedirect('/competitions/soccer-world-cup/predict')).toBe(
      '/competitions/soccer-world-cup/predict'
    )
  })

  it('falls back to competition home', () => {
    expect(resolvePostAuthRedirect(null)).toBe(POST_AUTH_DEFAULT_PATH)
    expect(resolvePostAuthRedirect(undefined)).toBe(POST_AUTH_DEFAULT_PATH)
    expect(resolvePostAuthRedirect('')).toBe(POST_AUTH_DEFAULT_PATH)
  })

  it('ignores auth entry paths to avoid loops', () => {
    expect(resolvePostAuthRedirect('/login')).toBe(POST_AUTH_DEFAULT_PATH)
    expect(resolvePostAuthRedirect('/login?next=%2F')).toBe(POST_AUTH_DEFAULT_PATH)
    expect(resolvePostAuthRedirect('/signup')).toBe(POST_AUTH_DEFAULT_PATH)
  })
})

describe('isAuthEntryPath', () => {
  it('detects login and signup', () => {
    expect(isAuthEntryPath('/login')).toBe(true)
    expect(isAuthEntryPath('/login?confirmed=1')).toBe(true)
    expect(isAuthEntryPath('/competitions/craven-week/predict')).toBe(false)
  })
})

describe('buildLoginHref', () => {
  it('embeds return path in next param', () => {
    expect(buildLoginHref('/competitions/craven-week/predict')).toBe(
      '/login?next=%2Fcompetitions%2Fcraven-week%2Fpredict'
    )
  })

  it('omits next for default login', () => {
    expect(buildLoginHref(null)).toBe('/login')
    expect(buildLoginHref('/login')).toBe('/login')
  })
})

describe('buildSignupHref', () => {
  it('embeds return path in next param', () => {
    expect(buildSignupHref('/competitions/craven-week/predict')).toBe(
      '/signup?next=%2Fcompetitions%2Fcraven-week%2Fpredict'
    )
  })
})
