import { describe, expect, it } from 'vitest'
import { isValidGeocodeQuery, mapNominatimResults } from './geocode'

describe('isValidGeocodeQuery', () => {
  it('requires at least 3 characters', () => {
    expect(isValidGeocodeQuery('ab')).toBe(false)
    expect(isValidGeocodeQuery('abc')).toBe(true)
    expect(isValidGeocodeQuery('  Paarl Boys High  ')).toBe(true)
  })
})

describe('mapNominatimResults', () => {
  it('maps nominatim rows to geocode results', () => {
    const results = mapNominatimResults([
      {
        place_id: 123,
        name: 'Paarl Boys High School',
        display_name: 'Paarl Boys High School, Paarl, South Africa',
        lat: '-33.7345',
        lon: '18.9612',
      },
    ])
    expect(results).toEqual([
      {
        id: '123',
        name: 'Paarl Boys High School',
        displayName: 'Paarl Boys High School, Paarl, South Africa',
        lat: -33.7345,
        lng: 18.9612,
      },
    ])
  })

  it('skips rows with invalid coordinates', () => {
    expect(mapNominatimResults([{ lat: 'bad', lon: '18.4' }])).toEqual([])
  })

  it('falls back to display name when name is missing', () => {
    const results = mapNominatimResults([
      {
        place_id: 456,
        display_name: 'Newlands Rugby Stadium, Cape Town',
        lat: '-33.9688',
        lon: '18.4683',
      },
    ])
    expect(results[0]?.name).toBe('Newlands Rugby Stadium')
  })
})
