import { slugify } from '@/lib/memory-map/validation'

export function suggestMemoryMapTitle(orgName: string): string {
  const name = orgName.trim()
  if (!name) return ''
  return `${name} Memory Map`
}

export function suggestCreateMapSlugs(orgName: string, mapTitle?: string): { orgSlug: string; mapSlug: string } {
  const orgSlug = slugify(orgName)
  const title = mapTitle?.trim() || suggestMemoryMapTitle(orgName)
  const mapSlug = slugify(title || orgName)
  return { orgSlug, mapSlug }
}

export const ORG_TYPE_LABELS: Record<string, string> = {
  school: 'School',
  event: 'Event',
  venue: 'Venue',
  club: 'Club',
  community: 'Community',
  place: 'Place',
  family: 'Family',
  organisation: 'Organisation',
  other: 'Other',
}

export const ORG_TYPE_OPTIONS = [
  'school',
  'event',
  'place',
  'family',
  'organisation',
  'venue',
  'club',
  'community',
  'other',
] as const

export const CREATE_MAP_EXAMPLES = [
  { organisation: 'Boishaai', memoryMap: 'Boishaai Memory Map' },
  { organisation: 'Ons Huis', memoryMap: 'Ons Huis Memory Map' },
  { organisation: 'Interschools Committee', memoryMap: 'Interschools 2026 Memory Map' },
] as const
