import { describe, expect, it } from 'vitest'
import {
  geolocationFailureStatus,
  MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE,
} from './use-memory-map-geolocation'

describe('geolocationFailureStatus', () => {
  it('maps permission denied to denied', () => {
    expect(geolocationFailureStatus(1)).toBe('denied')
  })

  it('maps other errors to error', () => {
    expect(geolocationFailureStatus(2)).toBe('error')
    expect(geolocationFailureStatus(3)).toBe('error')
  })
})

describe('MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE', () => {
  it('uses viewer copy for unavailable location', () => {
    expect(MEMORY_MAP_GEOLOCATION_UNAVAILABLE_MESSAGE).toBe(
      'Location not available. You can still explore the map.'
    )
  })
})
