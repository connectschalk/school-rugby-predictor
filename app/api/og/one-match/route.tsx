import { ImageResponse } from '@vercel/og'
import { getPublicSiteUrl } from '@/lib/site-url'
import { PLATFORM_OG_IMAGE_SRC } from '@/lib/platform-branding'

export const runtime = 'edge'

/** OG card: NextPlay Predictor platform logo only (no team crests). */
export async function GET() {
  const base = getPublicSiteUrl()
  const logoUrl = `${base}${PLATFORM_OG_IMAGE_SRC}`

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" width={280} height={304} style={{ objectFit: 'contain' }} />
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
