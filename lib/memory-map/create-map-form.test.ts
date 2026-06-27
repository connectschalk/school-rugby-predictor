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
  it('slugifies organisation name for both URLs', () => {
    expect(suggestCreateMapSlugs('Boishaai')).toEqual({
      orgSlug: 'boishaai',
      mapSlug: 'boishaai',
    })
    expect(suggestCreateMapSlugs('Ons Huis')).toEqual({
      orgSlug: 'ons-huis',
      mapSlug: 'ons-huis',
    })
  })
})
