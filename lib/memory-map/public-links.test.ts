import { describe, expect, it, vi } from 'vitest'
import { logMemoryMapPublicLink, memoryMapPublicPath } from './public-links'

describe('memoryMapPublicPath', () => {
  it('uses memory map slug for landing route', () => {
    expect(memoryMapPublicPath('paarl-van-der-merwes-memory-map')).toBe(
      '/memory-map/paarl-van-der-merwes-memory-map'
    )
  })

  it('uses memory map slug for map route, not organisation slug', () => {
    const mapSlug = 'paarl-van-der-merwes-memory-map'
    const orgSlug = 'van-der-merwe'
    expect(memoryMapPublicPath(mapSlug, 'map')).toBe(`/memory-map/${mapSlug}/map`)
    expect(memoryMapPublicPath(orgSlug, 'map')).toBe('/memory-map/van-der-merwe/map')
    expect(memoryMapPublicPath(mapSlug, 'map')).not.toBe(memoryMapPublicPath(orgSlug, 'map'))
  })

  it('uses memory map slug for add route', () => {
    expect(memoryMapPublicPath('boishaai-memory-map', 'add')).toBe('/memory-map/boishaai-memory-map/add')
  })
})

describe('logMemoryMapPublicLink', () => {
  it('logs public link diagnostics in development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logMemoryMapPublicLink({
      mapId: '6976fcac-be56-4d52-bcdd-9c2651f4c3ff',
      mapSlug: 'paarl-van-der-merwes-memory-map',
      orgSlug: 'van-der-merwe',
      href: '/memory-map/paarl-van-der-merwes-memory-map/map',
    })

    expect(info).toHaveBeenCalledWith(
      '[memory-map:public-link] mapId=6976fcac-be56-4d52-bcdd-9c2651f4c3ff mapSlug=paarl-van-der-merwes-memory-map orgSlug=van-der-merwe href=/memory-map/paarl-van-der-merwes-memory-map/map'
    )

    info.mockRestore()
    process.env.NODE_ENV = prev
  })

  it('does not log outside development', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logMemoryMapPublicLink({
      mapSlug: 'boishaai',
      href: '/memory-map/boishaai/map',
    })

    expect(info).not.toHaveBeenCalled()
    info.mockRestore()
    process.env.NODE_ENV = prev
  })
})
