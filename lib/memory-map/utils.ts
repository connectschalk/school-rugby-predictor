import type { MemoryArea, MemoryMap, MemoryMapBundle, MemoryPin, MemoryStory } from '@/lib/memory-map/types'

export type AreaGroup = 'outdoor' | 'indoor' | 'offsite'

export function areaGroup(area: MemoryArea): AreaGroup {
  const name = area.name.toLowerCase()
  if (name.includes('off-site') || name.includes('offsite') || name.includes('away')) return 'offsite'
  if (area.map_type === 'image' || name.includes('indoor') || name.includes('hall') || name.includes('hostel')) {
    return 'indoor'
  }
  return 'outdoor'
}

export function areaMapTypeLabel(area: MemoryArea): string {
  const name = area.name.toLowerCase()
  if (name.includes('off-site') || name.includes('offsite')) return 'Event Map'
  if (area.map_type === 'image') {
    if (name.includes('hostel') || name.includes('indoor')) return 'Indoor Map'
    return 'School Map'
  }
  return 'Geo Map'
}

export function storyTypeLabel(type: MemoryStory['story_type']): string {
  switch (type) {
    case 'video':
      return 'Video'
    case 'photo':
      return 'Photo'
    case 'text':
      return 'Text'
    case 'mixed':
      return 'Mixed'
    default:
      return 'Story'
  }
}

export function uploadModeLabel(mode: MemoryStory['upload_mode']): string {
  switch (mode) {
    case 'current_location':
      return 'Current location'
    case 'manual_geo':
      return 'Manual geo'
    case 'manual_image_map':
      return 'School / indoor map'
    case 'archive_submission':
      return 'Archive submission'
    default:
      return mode
  }
}

export function latestStoryYear(stories: MemoryStory[]): number | null {
  const approved = stories.filter((s) => s.status === 'approved')
  if (approved.length === 0) return null
  return Math.max(...approved.map((s) => s.event_year))
}

export function yearRangeForStories(stories: MemoryStory[]): string {
  const years = stories.filter((s) => s.status === 'approved').map((s) => s.event_year)
  if (years.length === 0) return '—'
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? String(min) : `${min}–${max}`
}

export function uniqueContributors(stories: MemoryStory[]): number {
  const names = new Set(
    stories
      .map((s) => s.logged_by_display_name?.trim())
      .filter((n): n is string => Boolean(n))
  )
  return names.size
}

export type YearFilterKey = 'all' | 'this_year' | 'last_5' | 'archive' | 'custom'

export function matchesYearFilter(story: MemoryStory, filter: YearFilterKey, customYear?: number): boolean {
  const y = story.event_year
  const now = new Date().getFullYear()
  switch (filter) {
    case 'all':
      return true
    case 'this_year':
      return y === now
    case 'last_5':
      return y >= now - 5
    case 'archive':
      return y < now - 20
    case 'custom':
      return customYear != null && y === customYear
    default:
      return true
  }
}

export function bundleStats(bundle: MemoryMapBundle) {
  const approvedStories = bundle.stories.filter((s) => s.status === 'approved')
  const approvedPins = bundle.pins.filter((p) => p.status === 'approved')
  const pendingStories = bundle.stories.filter((s) => s.status === 'pending_review')
  const highRiskPending = pendingStories.filter(
    (s) => s.risk_level === 'high' || s.risk_level === 'admin_review'
  )
  const recentSubmissions = pendingStories.length // proxy without created_at in type

  return {
    areaCount: bundle.areas.filter((a) => a.is_active).length,
    pinCount: approvedPins.length,
    storyCount: approvedStories.length,
    pendingStories: pendingStories.length,
    highRiskPending: highRiskPending.length,
    recentSubmissions,
  }
}

export type MapHealthItem = { id: string; label: string; ok: boolean }

export function mapHealthChecklist(bundle: MemoryMapBundle): MapHealthItem[] {
  const { map, areas, categories, stories } = bundle
  const approvedStories = stories.filter((s) => s.status === 'approved')
  return [
    { id: 'profile', label: 'Profile image uploaded', ok: Boolean(map.profile_image_url) },
    { id: 'background', label: 'Background image uploaded', ok: Boolean(map.landing_background_url) },
    { id: 'sponsor', label: 'Sponsor added', ok: Boolean(map.sponsor_name) },
    { id: 'area', label: 'At least one active area', ok: areas.some((a) => a.is_active) },
    { id: 'category', label: 'At least one active category', ok: categories.some((c) => c.is_active) },
    { id: 'qr', label: 'QR link ready', ok: Boolean(map.slug) },
    { id: 'stories', label: 'Public map has approved stories', ok: approvedStories.length > 0 },
  ]
}

/** Relative luminance contrast ratio (simplified WCAG). */
export function contrastRatio(hexFg: string, hexBg: string): number {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const n = parseInt(full, 16)
    const r = ((n >> 16) & 255) / 255
    const g = ((n >> 8) & 255) / 255
    const b = (n & 255) / 255
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const l1 = parse(hexFg)
  const l2 = parse(hexBg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function pinStats(pin: MemoryPin, stories: MemoryStory[]) {
  const pinStories = stories.filter((s) => s.pin_id === pin.id)
  const approved = pinStories.filter((s) => s.status === 'approved')
  const pending = pinStories.filter((s) => s.status === 'pending_review')
  const years = approved.map((s) => s.event_year)
  return {
    total: pinStories.length,
    approved: approved.length,
    pending: pending.length,
    yearRange: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—',
  }
}

export function isMapViewable(map: MemoryMap, canAccessPrivate: boolean): boolean {
  if (map.status !== 'active') return false
  if (map.visibility === 'private' && !canAccessPrivate) return false
  return true
}

export const DEFAULT_MEMORY_MAP_BRANDING: Pick<
  MemoryMap,
  | 'primary_color'
  | 'primary_text_color'
  | 'secondary_color'
  | 'secondary_text_color'
  | 'accent_color'
> = {
  primary_color: '#FFD400',
  primary_text_color: '#050505',
  secondary_color: 'transparent',
  secondary_text_color: '#FFFFFF',
  accent_color: '#FFD400',
}
