import { describe, expect, it } from 'vitest'
import {
  getNovaAdPlacements,
  inlineAdInsertIndices,
  NOVA_AD_PLACEMENTS,
} from './placements'
import { interleaveWithInlineAds } from './interleave'
import { PLATFORM_NAME } from '../platform-branding'

describe('advertising placements', () => {
  it('contains unique placement IDs', () => {
    const ids = NOVA_AD_PLACEMENTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('exposes getNovaAdPlacements catalogue', () => {
    expect(getNovaAdPlacements().length).toBeGreaterThanOrEqual(8)
  })

  it('inserts inline ads at interval and never after the final card', () => {
    expect(inlineAdInsertIndices(0)).toEqual([])
    expect(inlineAdInsertIndices(5)).toEqual([])
    expect(inlineAdInsertIndices(6)).toEqual([5])
    expect(inlineAdInsertIndices(12)).toEqual([5, 10])
    expect(inlineAdInsertIndices(12).every((i) => i < 12)).toBe(true)
  })

  it('interleaves ads without a trailing advert', () => {
    const items = Array.from({ length: 11 }, (_, i) => i)
    const seq = interleaveWithInlineAds(items, 5)
    const last = seq[seq.length - 1]
    expect(last?.type).toBe('item')
    expect(seq.filter((e) => e.type === 'ad')).toHaveLength(2)
  })
})

describe('platform branding outside demo', () => {
  it('keeps NextPlay as the default platform name', () => {
    expect(PLATFORM_NAME).toBe('NextPlay Predictor')
  })
})
