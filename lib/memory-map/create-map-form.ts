import { slugify } from '@/lib/memory-map/validation'

export function suggestMemoryMapTitle(orgName: string): string {
  const name = orgName.trim()
  if (!name) return ''
  return `${name} Memory Map`
}

export function suggestCreateMapSlugs(orgName: string): { orgSlug: string; mapSlug: string } {
  const slug = slugify(orgName)
  return { orgSlug: slug, mapSlug: slug }
}

export const ORG_TYPE_LABELS: Record<string, string> = {
  school: 'School',
  event: 'Event',
  venue: 'Venue',
  club: 'Club',
  community: 'Community',
}

export const CREATE_MAP_EXAMPLES = [
  { organisation: 'Boishaai', memoryMap: 'Boishaai Memory Map' },
  { organisation: 'Ons Huis', memoryMap: 'Ons Huis Memory Map' },
  { organisation: 'Interschools Committee', memoryMap: 'Interschools 2026 Memory Map' },
] as const
