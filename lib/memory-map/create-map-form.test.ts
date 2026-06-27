import { describe, expect, it } from 'vitest'
import { suggestCreateMapSlugs, suggestMemoryMapTitle } from './create-map-form'

describe('suggestMemoryMapTitle', () => {
  it('appends Memory Map to organisation name', () => {
    expect(suggestMemoryMapTitle('Boishaai')).toBe('Boishaai Memory Map')
    expect(suggestMemoryMapTitle('Ons Huis')).toBe('Ons Huis Memory Map')
  })

  it('returns empty for blank input', () => {
    expect(suggestMemoryMapTitle('')).toBe('')
    expect(suggestMemoryMapTitle('   ')).toBe('')
  })
})

describe('suggestCreateMapSlugs', () => {
  it('keeps organisation slug and memory map slug separate', () => {
    expect(suggestCreateMapSlugs('Paarl van der Merwe')).toEqual({
      orgSlug: 'paarl-van-der-merwe',
      mapSlug: 'paarl-van-der-merwe-memory-map',
    })
    expect(suggestCreateMapSlugs('Boishaai')).toEqual({
      orgSlug: 'boishaai',
      mapSlug: 'boishaai-memory-map',
    })
  })

  it('uses provided map title for the memory map slug', () => {
    expect(suggestCreateMapSlugs('Ons Huis', 'Interschools 2026 Memory Map')).toEqual({
      orgSlug: 'ons-huis',
      mapSlug: 'interschools-2026-memory-map',
    })
  })
})
