import { ImageResponse } from 'next/og'
import { readPublicImageAsDataUrl } from '@/lib/og-image-data-url'
import {
  PLATFORM_LOGO_ALT,
  PLATFORM_OG_IMAGE_HEIGHT,
  PLATFORM_OG_IMAGE_SRC,
  PLATFORM_OG_IMAGE_WIDTH,
} from '@/lib/platform-branding'

export const alt = PLATFORM_LOGO_ALT
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logoSrc = (await readPublicImageAsDataUrl(PLATFORM_OG_IMAGE_SRC)) ?? undefined
  const logoW = Math.round((PLATFORM_OG_IMAGE_WIDTH / PLATFORM_OG_IMAGE_HEIGHT) * 320)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" width={logoW} height={320} style={{ objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 48, fontWeight: 800, color: '#171717' }}>NextPlay Predictor</span>
        )}
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
