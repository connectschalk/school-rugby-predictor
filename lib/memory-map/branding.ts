import type { MemoryMap, MemoryOrganisation } from '@/lib/memory-map/types'
import { getPublicSiteUrl } from '@/lib/site-url'

/** Default Memory Map mark when no map/org logo is uploaded. */
export const DEFAULT_MEMORY_MAP_LOGO_SRC = '/memory-map/default-memory-map-logo.png'

export const DEFAULT_MEMORY_MAP_LOGO_WIDTH = 296
export const DEFAULT_MEMORY_MAP_LOGO_HEIGHT = 260

export const DEFAULT_MEMORY_MAP_SHARE_DESCRIPTION =
  'Explore the stories, memories and places on this Memory Map.'

type MapLogoSource = Pick<MemoryMap, 'profile_image_url'> & {
  organisation?: Pick<MemoryOrganisation, 'logo_url'> | null
}

/** Uploaded map profile image, then organisation logo, then default Memory Map logo. */
export function resolveMemoryMapLogoUrl(map: MapLogoSource): string {
  const profile = map.profile_image_url?.trim()
  if (profile) return profile

  const orgLogo = map.organisation?.logo_url?.trim()
  if (orgLogo) return orgLogo

  return DEFAULT_MEMORY_MAP_LOGO_SRC
}

export function hasCustomMemoryMapLogo(map: MapLogoSource): boolean {
  return Boolean(map.profile_image_url?.trim() || map.organisation?.logo_url?.trim())
}

export function absoluteMemoryMapAssetUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${getPublicSiteUrl()}${path}`
}

/** Share/OG image: custom logo only — never Predictor branding or landing photos. */
export function resolveMemoryMapShareImageUrl(map: MapLogoSource): string {
  return resolveMemoryMapLogoUrl(map)
}

export function absoluteMemoryMapShareImageUrl(map: MapLogoSource): string {
  return absoluteMemoryMapAssetUrl(resolveMemoryMapShareImageUrl(map))
}
