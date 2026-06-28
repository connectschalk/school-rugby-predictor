/** Global NextPlay Predictor platform branding (not competition-specific). */

import type { Metadata } from 'next'

export const PLATFORM_NAME = 'NextPlay Predictor'

/** Black wordmark on light/transparent — header, auth, exports. */
export const PLATFORM_LOGO_SRC = '/nextplay-predictor.png'

/** Wordmark / full logo for Open Graph (1200×630 via /opengraph-image). */
export const PLATFORM_OG_IMAGE_SRC = '/opengraph-image'

export const PLATFORM_OG_IMAGE_WIDTH = 1200
export const PLATFORM_OG_IMAGE_HEIGHT = 630

/** P mark for admin avatars and predictor position on community voting charts. */
export const ADMIN_AVATAR_SRC = '/admin-avatar.png'

/** Custom profile image wins; otherwise admins get the platform mark. */
export function resolveProfileAvatarUrl(
  avatarUrl: string | null | undefined,
  isAdmin: boolean
): string | null {
  const custom = avatarUrl?.trim()
  if (custom) return custom
  return isAdmin ? ADMIN_AVATAR_SRC : null
}

export const PLATFORM_PREDICTOR_MARK_SRC = '/nextplay-predictor-logo.png'

/** White wordmark on dark — landing hero. */
export const PLATFORM_LOGO_LANDING_DARK_SRC = '/nextplay-predictor-landing-dark.png'

export const PLATFORM_LOGO_ALT = 'NextPlay Predictor'

export const PLATFORM_HOME_HREF = '/'

export const PLATFORM_METADATA_DESCRIPTION =
  'Predict scores across school rugby, Craven Week, and the Soccer World Cup. Create pools and compete on every match.'

export function platformOpenGraphImages(): NonNullable<Metadata['openGraph']>['images'] {
  return [
    {
      url: PLATFORM_OG_IMAGE_SRC,
      width: PLATFORM_OG_IMAGE_WIDTH,
      height: PLATFORM_OG_IMAGE_HEIGHT,
      alt: PLATFORM_LOGO_ALT,
      type: 'image/png',
    },
  ]
}

/** Root site metadata for layout and social crawlers. */
export function buildPlatformSiteMetadata(): Metadata {
  return {
    title: PLATFORM_NAME,
    description: PLATFORM_METADATA_DESCRIPTION,
    openGraph: {
      title: PLATFORM_NAME,
      description: PLATFORM_METADATA_DESCRIPTION,
      siteName: PLATFORM_NAME,
      type: 'website',
      images: platformOpenGraphImages(),
    },
    twitter: {
      card: 'summary_large_image',
      title: PLATFORM_NAME,
      description: PLATFORM_METADATA_DESCRIPTION,
      images: [PLATFORM_OG_IMAGE_SRC],
    },
  }
}
