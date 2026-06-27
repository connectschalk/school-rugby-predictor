import { describe, expect, it } from 'vitest'
import {
  filterDirectoryEntries,
  getDemoDirectoryEntry,
  organisationTypeLabel,
  buildFallbackDirectory,
} from './directory-types'

describe('getDemoDirectoryEntry', () => {
  it('returns Boishaai demo with preview flag', () => {
    const entry = getDemoDirectoryEntry()
    expect(entry.slug).toBe('boishaai')
    expect(entry.isDemoPreview).toBe(true)
    expect(entry.source).toBe('demo')
    expect(entry.areaCount).toBeGreaterThan(0)
  })
})

describe('filterDirectoryEntries', () => {
  const entries = [
    { ...getDemoDirectoryEntry(), organisationType: 'school' as const },
    {
      ...getDemoDirectoryEntry(),
      id: 'other',
      slug: 'springbok-day',
      title: 'Springbok Day',
      organisationName: 'Springbok Day',
      organisationType: 'event' as const,
      isDemoPreview: false,
      source: 'supabase' as const,
    },
  ]

  it('filters by organisation type', () => {
    expect(filterDirectoryEntries(entries, '', 'event')).toHaveLength(1)
    expect(filterDirectoryEntries(entries, '', 'school')).toHaveLength(1)
  })

  it('filters by search query', () => {
    expect(filterDirectoryEntries(entries, 'springbok', 'all')).toHaveLength(1)
    expect(filterDirectoryEntries(entries, 'boishaai memory', 'all')).toHaveLength(1)
  })
})

describe('organisationTypeLabel', () => {
  it('maps known types', () => {
    expect(organisationTypeLabel('school')).toBe('School')
    expect(organisationTypeLabel('event')).toBe('Event')
    expect(organisationTypeLabel('venue')).toBe('Venue')
  })
})

describe('buildFallbackDirectory', () => {
  it('returns demo entry when unavailable', () => {
    const fallback = buildFallbackDirectory(true)
    expect(fallback.demoEntry?.slug).toBe('boishaai')
    expect(fallback.directoryUnavailable).toBe(true)
    expect(fallback.dataSource).toBe('fallback')
  })

  it('returns demo source when supabase is not configured', () => {
    const fallback = buildFallbackDirectory(false)
    expect(fallback.dataSource).toBe('demo')
    expect(fallback.directoryUnavailable).toBeUndefined()
  })
})
