import { ImageResponse } from 'next/og'
import { buildPoolShareDescription, normalizePoolInviteToken } from '@/lib/pool-og'
import { fetchPoolInviteForOg } from '@/lib/pool-invite-server'
import { poolLogoInitials } from '@/lib/pool-logo'
import { fetchImageAsDataUrl } from '@/lib/og-image-data-url'
import { PLATFORM_LOGO_SRC, PLATFORM_NAME } from '@/lib/platform-branding'
import { getPublicSiteUrl } from '@/lib/site-url'

export const runtime = 'edge'

const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'
const TEXT = '#111827'
const MUTED = '#6b7280'

type PoolOgPayload = {
  poolName: string
  competitionName: string
  brandLogoSrc: string | null
  poolLogoSrc: string | null
  hasPool: boolean
}

const BRAND_LOGO_WIDTH = 560
const BRAND_LOGO_HEIGHT = 142
const POOL_LOGO_SIZE = 100
const POOL_LOGO_RADIUS = 16

function poolTitleFontSize(name: string): number {
  const len = name.length
  if (len > 42) return 44
  if (len > 28) return 52
  return 64
}

function PoolLogoFrame({
  poolLogoSrc,
  initials,
  show,
}: {
  poolLogoSrc: string | null
  initials: string
  show: boolean
}) {
  if (!show) return null

  return (
    <div
      style={{
        width: POOL_LOGO_SIZE,
        height: POOL_LOGO_SIZE,
        display: 'flex',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: POOL_LOGO_RADIUS,
        border: '2px solid #e5e7eb',
        background: '#f3f4f6',
        overflow: 'hidden',
      }}
    >
      {poolLogoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poolLogoSrc}
          alt=""
          width={POOL_LOGO_SIZE}
          height={POOL_LOGO_SIZE}
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <span style={{ fontSize: 36, fontWeight: 800, color: '#9ca3af' }}>{initials}</span>
      )}
    </div>
  )
}

function PoolOgCard({ payload }: { payload: PoolOgPayload }) {
  const { poolName, competitionName, brandLogoSrc, poolLogoSrc, hasPool } = payload
  const initials = poolLogoInitials(poolName)
  const title = hasPool ? poolName : 'Join a prediction pool'
  const titleSize = hasPool ? poolTitleFontSize(poolName) : 52

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
      <div
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {brandLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoSrc}
            alt=""
            width={BRAND_LOGO_WIDTH}
            height={BRAND_LOGO_HEIGHT}
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: 56, fontWeight: 800, color: TEXT, textAlign: 'center' }}>
            {PLATFORM_NAME}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 16,
          marginTop: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <PoolLogoFrame poolLogoSrc={poolLogoSrc} initials={initials} show={hasPool} />
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: -0.5,
              maxWidth: hasPool ? 940 : 1000,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ fontSize: 28, fontWeight: 600, color: MUTED, maxWidth: 1000 }}>
          {hasPool ? competitionName : PLATFORM_NAME}
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, color: MUTED, maxWidth: 1000 }}>
          {hasPool
            ? buildPoolShareDescription(competitionName).split('.')[0]
            : 'Predict scores and compete with friends'}
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
