import { ImageResponse } from 'next/og'
import { buildPoolShareDescription, normalizePoolInviteToken } from '@/lib/pool-og'
import { fetchPoolInviteForOg } from '@/lib/pool-invite-server'
import { poolLogoInitials } from '@/lib/pool-logo'
import { fetchImageAsDataUrl } from '@/lib/og-image-data-url'
import { PLATFORM_LOGO_SRC, PLATFORM_NAME } from '@/lib/platform-branding'
import { getPublicSiteUrl } from '@/lib/site-url'

export const runtime = 'edge'

const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'
const RED = '#ef4444'
const TEXT = '#111827'
const MUTED = '#6b7280'
const SITE_HOST = 'thenextplay.co.za'

type PoolOgPayload = {
  poolName: string
  competitionName: string
  brandLogoSrc: string | null
  poolLogoSrc: string | null
  hasPool: boolean
}

function PoolOgCard({ payload }: { payload: PoolOgPayload }) {
  const { poolName, competitionName, brandLogoSrc, poolLogoSrc, hasPool } = payload
  const initials = poolLogoInitials(poolName)

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        color: TEXT,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: '48px 64px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {brandLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogoSrc} alt="" width={220} height={56} style={{ objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>{PLATFORM_NAME}</span>
        )}
        <div
          style={{
            width: 132,
            height: 132,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 24,
            border: '2px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          {poolLogoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poolLogoSrc} alt="" width={96} height={96} style={{ objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 40, fontWeight: 800, color: '#9ca3af' }}>{initials}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: RED }} />
        <div
          style={{
            fontSize: hasPool && poolName.length > 34 ? 44 : 52,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: -0.5,
            maxWidth: 900,
          }}
        >
          {hasPool ? poolName : 'Join a prediction pool'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: MUTED, maxWidth: 900 }}>
          {hasPool ? competitionName : PLATFORM_NAME}
        </div>
        <div style={{ fontSize: 20, fontWeight: 500, color: MUTED }}>
          {hasPool ? buildPoolShareDescription(competitionName).split('.')[0] : 'Predict scores and compete with friends'}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            marginTop: 8,
            borderRadius: 999,
            background: '#111827',
            color: '#ffffff',
            padding: '14px 28px',
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          Join the pool
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 600, color: MUTED }}>{SITE_HOST}</div>
    </div>
  )
}

async function buildPoolOgPayload(token: string): Promise<PoolOgPayload> {
  const base = getPublicSiteUrl()
  const pool = await fetchPoolInviteForOg(token)
  const brandLogoSrc = await fetchImageAsDataUrl(`${base}${PLATFORM_LOGO_SRC}`)

  if (!pool) {
    return {
      poolName: '',
      competitionName: PLATFORM_NAME,
      brandLogoSrc,
      poolLogoSrc: null,
      hasPool: false,
    }
  }

  const poolLogoSrc = pool.logo_url ? await fetchImageAsDataUrl(pool.logo_url) : null

  return {
    poolName: pool.name,
    competitionName: pool.competition_name,
    brandLogoSrc,
    poolLogoSrc,
    hasPool: true,
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await context.params
  const token = normalizePoolInviteToken(rawToken)

  try {
    const payload = await buildPoolOgPayload(token)
    return new ImageResponse(<PoolOgCard payload={payload} />, {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': OG_CACHE_CONTROL,
        'Content-Type': 'image/png',
      },
    })
  } catch {
    const payload: PoolOgPayload = {
      poolName: '',
      competitionName: PLATFORM_NAME,
      brandLogoSrc: null,
      poolLogoSrc: null,
      hasPool: false,
    }
    return new ImageResponse(<PoolOgCard payload={payload} />, {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': OG_CACHE_CONTROL,
        'Content-Type': 'image/png',
      },
    })
  }
}
