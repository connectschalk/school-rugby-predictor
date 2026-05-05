import { ImageResponse } from '@vercel/og'
import { getPublicSiteUrl } from '@/lib/site-url'

export const runtime = 'edge'

/** OG card: School Rugby Predictor app logo only (no team crests). */
export async function GET() {
  const base = getPublicSiteUrl()
  const logoUrl = `${base}/nextplay-predictor.png`

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
        <img src={logoUrl} alt="" width={520} height={156} style={{ objectFit: 'contain' }} />
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
