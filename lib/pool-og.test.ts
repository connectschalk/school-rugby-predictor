import { describe, expect, it } from 'vitest'
import {
  buildPoolShareDescription,
  buildPoolShareTitle,
  poolOgImageVersion,
} from '@/lib/pool-og'

describe('poolOgImageVersion', () => {
  it('returns 0 when no logo', () => {
    expect(poolOgImageVersion({ id: 'abc', logo_url: null })).toBe('0')
  })

  it('extracts timestamp from storage path', () => {
    expect(
      poolOgImageVersion({
        id: 'abc',
        logo_url: 'https://example.com/storage/pools/x/logo-1710000000000.png',
      })
    ).toBe('1710000000000')
  })

  it('returns stable hash for other logo urls', () => {
    const v = poolOgImageVersion({
      id: 'abc',
      logo_url: 'https://example.com/logo.png',
    })
    expect(v).not.toBe('0')
    expect(poolOgImageVersion({ id: 'abc', logo_url: 'https://example.com/logo.png' })).toBe(v)
  })
})

describe('buildPoolShareTitle', () => {
  it('includes pool name', () => {
    expect(buildPoolShareTitle('Rugby Factory')).toBe('Join Rugby Factory on NextPlay Predictor')
  })
})

describe('buildPoolShareDescription', () => {
  it('includes competition name', () => {
    expect(buildPoolShareDescription('Craven Week')).toContain('Craven Week')
  })
})
