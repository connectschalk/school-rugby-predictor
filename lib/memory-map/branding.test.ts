import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MEMORY_MAP_LOGO_SRC,
  resolveMemoryMapLogoUrl,
  resolveMemoryMapShareImageUrl,
} from './branding'

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrl: () => 'https://www.thenextplay.co.za',
}))

describe('memory-map branding', () => {
  const map = {
    profile_image_url: null as string | null,
    organisation: { logo_url: null as string | null },
  }

  it('uses profile image first', () => {
    expect(
      resolveMemoryMapLogoUrl({
        profile_image_url: 'https://cdn.example.com/map-logo.png',
        organisation: { logo_url: 'https://cdn.example.com/org.png' },
      })
    ).toBe('https://cdn.example.com/map-logo.png')
  })

  it('falls back to organisation logo', () => {
    expect(
      resolveMemoryMapLogoUrl({
        profile_image_url: null,
        organisation: { logo_url: 'https://cdn.example.com/org.png' },
      })
    ).toBe('https://cdn.example.com/org.png')
  })

  it('falls back to default Memory Map logo', () => {
    expect(resolveMemoryMapLogoUrl(map)).toBe(DEFAULT_MEMORY_MAP_LOGO_SRC)
    expect(resolveMemoryMapShareImageUrl(map)).toBe(DEFAULT_MEMORY_MAP_LOGO_SRC)
  })
})
