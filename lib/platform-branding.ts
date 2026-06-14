/** Global NextPlay Predictor platform branding (not competition-specific). */

import type { Metadata } from 'next'

export const PLATFORM_NAME = 'NextPlay Predictor'

/** Black wordmark on light/transparent — header, auth, exports. */
export const PLATFORM_LOGO_SRC = '/nextplay-predictor.png'

/** Square P mark — WhatsApp, Facebook, LinkedIn, X, iMessage Open Graph. */
export const PLATFORM_OG_IMAGE_SRC = '/nextplay-predictor-logo.png'

export const PLATFORM_OG_IMAGE_WIDTH = 374
export const PLATFORM_OG_IMAGE_HEIGHT = 406

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
