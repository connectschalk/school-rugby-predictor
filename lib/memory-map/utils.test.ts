import { describe, expect, it } from 'vitest'
import { DEMO_MEMORY_MAP_BUNDLE } from './demo-data'
import {
  bundleStats,
  isMapViewable,
  matchesYearFilter,
  pinStats,
} from './utils'

describe('matchesYearFilter', () => {
  const story = { ...DEMO_MEMORY_MAP_BUNDLE.stories[0]!, event_year: new Date().getFullYear() }

  it('filters by year modes', () => {
    expect(matchesYearFilter(story, 'all')).toBe(true)
    expect(matchesYearFilter(story, 'this_year')).toBe(true)
    expect(matchesYearFilter({ ...story, event_year: 1990 }, 'archive')).toBe(true)
  })
})

describe('bundleStats', () => {
  it('counts approved and pending content', () => {
    const stats = bundleStats(DEMO_MEMORY_MAP_BUNDLE)
    expect(stats.areaCount).toBeGreaterThan(0)
    expect(stats.pinCount).toBeGreaterThan(0)
    expect(stats.storyCount).toBeGreaterThan(0)
    expect(stats.pendingStories).toBeGreaterThanOrEqual(0)
  })
})

describe('pinStats', () => {
  it('summarises pin stories', () => {
    const pin = DEMO_MEMORY_MAP_BUNDLE.pins[0]!
    const stats = pinStats(pin, DEMO_MEMORY_MAP_BUNDLE.stories)
    expect(stats.approved).toBeGreaterThanOrEqual(0)
    expect(stats.yearRange).toBeTruthy()
  })
})

describe('isMapViewable', () => {
  it('blocks inactive and private maps without access', () => {
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, status: 'draft' as const }
    expect(isMapViewable(map, true)).toBe(false)

    const privateMap = { ...DEMO_MEMORY_MAP_BUNDLE.map, status: 'active' as const, visibility: 'private' as const }
    expect(isMapViewable(privateMap, false)).toBe(false)
    expect(isMapViewable(privateMap, true)).toBe(true)
  })

  it('allows public active maps', () => {
    const map = { ...DEMO_MEMORY_MAP_BUNDLE.map, status: 'active' as const, visibility: 'public' as const }
    expect(isMapViewable(map, false)).toBe(true)
  })
})
