import { DEMO_MAP_SLUG } from '@/lib/memory-map/constants'
import { DEMO_MEMORY_MAP_BUNDLE } from '@/lib/memory-map/demo-data'
import { bundleStats } from '@/lib/memory-map/utils'
import type { OrganisationType } from '@/lib/memory-map/types'

export type MemoryMapDirectoryEntry = {
  id: string
  slug: string
  title: string
  tagline: string | null
  description: string | null
  visibility: 'public' | 'link_only' | 'private'
  profileImageUrl: string | null
  landingBackgroundUrl: string | null
  sponsorName: string | null
  sponsorLogoUrl: string | null
  organisationName: string
  organisationType: OrganisationType
  organisationLogoUrl: string | null
  areaCount: number
  pinCount: number
  storyCount: number
  source: 'supabase' | 'demo'
  isDemoPreview: boolean
}

export type DirectoryOrganisationFilter = 'all' | 'school' | 'event' | 'venue'

export type PublicMemoryMapDirectory = {
  liveEntries: MemoryMapDirectoryEntry[]
  demoEntry: MemoryMapDirectoryEntry | null
  dataSource: 'supabase' | 'demo' | 'fallback'
  directoryUnavailable?: boolean
}

export const MEMORY_MAP_PRODUCT_HEADLINE = 'Place-based story archives'
export const MEMORY_MAP_PRODUCT_SUBHEADLINE =
  'Create a living map of your school, venue or event. Pin videos, photos and stories to the places where they happened.'
export const MEMORY_MAP_TAGLINE = 'Every place has a story. Capture it where it happened.'

export function organisationTypeLabel(type: OrganisationType): string {
  switch (type) {
    case 'school':
      return 'School'
    case 'event':
      return 'Event'
    case 'venue':
      return 'Venue'
    case 'club':
      return 'Club'
    case 'community':
      return 'Community'
    default:
      return 'Place'
  }
}

export function getDemoDirectoryEntry(): MemoryMapDirectoryEntry {
  const bundle = DEMO_MEMORY_MAP_BUNDLE
  const stats = bundleStats(bundle)
  return {
    id: bundle.map.id,
    slug: bundle.map.slug,
    title: bundle.map.title,
    tagline: bundle.map.tagline,
    description: bundle.map.description,
    visibility: bundle.map.visibility,
    profileImageUrl: bundle.map.profile_image_url,
    landingBackgroundUrl: bundle.map.landing_background_url,
    sponsorName: bundle.map.sponsor_name,
    sponsorLogoUrl: bundle.map.sponsor_logo_url,
    organisationName: bundle.map.organisation?.name ?? 'Boishaai',
    organisationType: bundle.map.organisation?.type ?? 'school',
    organisationLogoUrl: bundle.map.organisation?.logo_url ?? null,
    areaCount: stats.areaCount,
    pinCount: stats.pinCount,
    storyCount: stats.storyCount,
    source: 'demo',
    isDemoPreview: true,
  }
}

export function buildFallbackDirectory(unavailable = false): PublicMemoryMapDirectory {
  return {
    liveEntries: [],
    demoEntry: getDemoDirectoryEntry(),
    dataSource: unavailable ? 'fallback' : 'demo',
    directoryUnavailable: unavailable || undefined,
  }
}

export function filterDirectoryEntries(
  entries: MemoryMapDirectoryEntry[],
  query: string,
  orgFilter: DirectoryOrganisationFilter
): MemoryMapDirectoryEntry[] {
  const q = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (orgFilter !== 'all' && entry.organisationType !== orgFilter) return false
    if (!q) return true
    const haystack = [
      entry.title,
      entry.tagline ?? '',
      entry.description ?? '',
      entry.organisationName,
      entry.slug,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function shouldShowDemoEntry(
  liveEntries: MemoryMapDirectoryEntry[],
  demoEntry: MemoryMapDirectoryEntry | null
): demoEntry is MemoryMapDirectoryEntry {
  if (!demoEntry) return false
  return !liveEntries.some((e) => e.slug === DEMO_MAP_SLUG)
}
