import { describe, expect, it } from 'vitest'
import {
  buildMemoryMapSignInHref,
  buildMemoryMapSignUpHref,
  isMemoryMapAuthEntryPath,
  MEMORY_MAP_ACCOUNT_PATH,
  parseMemoryMapSlugFromPath,
  resolveMemoryMapPostAuthRedirect,
  safeMemoryMapReturnPath,
} from './auth-routes'

describe('safeMemoryMapReturnPath', () => {
  it('accepts memory-map paths only', () => {
    expect(safeMemoryMapReturnPath('/memory-map/boishaai/add')).toBe('/memory-map/boishaai/add')
    expect(safeMemoryMapReturnPath('/memory-map/admin')).toBe('/memory-map/admin')
  })

  it('rejects non-memory-map and external paths', () => {
    expect(safeMemoryMapReturnPath('/predictor')).toBeNull()
    expect(safeMemoryMapReturnPath('https://evil.test/memory-map')).toBeNull()
    expect(safeMemoryMapReturnPath('//evil.test/memory-map')).toBeNull()
  })
})

describe('resolveMemoryMapPostAuthRedirect', () => {
  it('redirects to safe next path', () => {
    expect(resolveMemoryMapPostAuthRedirect('/memory-map/boishaai/add')).toBe('/memory-map/boishaai/add')
  })

  it('falls back to memory map home', () => {
    expect(resolveMemoryMapPostAuthRedirect(null)).toBe('/memory-map')
    expect(resolveMemoryMapPostAuthRedirect('/predictor')).toBe('/memory-map')
  })

  it('ignores auth entry paths', () => {
    expect(resolveMemoryMapPostAuthRedirect('/memory-map/auth/sign-in')).toBe('/memory-map')
  })
})

describe('buildMemoryMapSignInHref', () => {
  it('embeds next param for memory map paths', () => {
    expect(buildMemoryMapSignInHref('/memory-map/boishaai/add')).toBe(
      '/memory-map/auth/sign-in?next=%2Fmemory-map%2Fboishaai%2Fadd'
    )
  })
})

describe('buildMemoryMapSignUpHref', () => {
  it('embeds next param for memory map paths', () => {
    expect(buildMemoryMapSignUpHref('/memory-map/find')).toBe('/memory-map/auth/sign-up?next=%2Fmemory-map%2Ffind')
  })
})

describe('isMemoryMapAuthEntryPath', () => {
  it('detects memory map auth routes', () => {
    expect(isMemoryMapAuthEntryPath('/memory-map/auth/sign-in')).toBe(true)
    expect(isMemoryMapAuthEntryPath('/memory-map/boishaai')).toBe(false)
  })
})

describe('MEMORY_MAP_ACCOUNT_PATH', () => {
  it('points to the memory map account route', () => {
    expect(MEMORY_MAP_ACCOUNT_PATH).toBe('/memory-map/account')
    expect(safeMemoryMapReturnPath(MEMORY_MAP_ACCOUNT_PATH)).toBe('/memory-map/account')
  })
})

describe('parseMemoryMapSlugFromPath', () => {
  it('does not treat account as a map slug', () => {
    expect(parseMemoryMapSlugFromPath('/memory-map/account')).toBeNull()
    expect(parseMemoryMapSlugFromPath('/memory-map/boishaai/map')).toBe('boishaai')
  })
})
