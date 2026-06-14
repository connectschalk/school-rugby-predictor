import { ImageResponse } from 'next/og'
import { fetchOneMatchOgBySlug, formatOneMatchKickoffOg } from '@/lib/one-match-og'
import { normalizeOneMatchSlug } from '@/lib/one-match-challenge-lookup'
import { fetchImageAsDataUrl } from '@/lib/og-image-data-url'
import { getPublicSiteUrl } from '@/lib/site-url'
import { PLATFORM_LOGO_SRC } from '@/lib/platform-branding'

export const runtime = 'edge'

export const alt = 'Match preview'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export const revalidate = 300

const OG_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'

type Props = { params: Promise<{ slug: string }> }

type MatchOgPayload = {
  home: string
  away: string
  kickoff: string
  homeLogoSrc: string | null
  awayLogoSrc: string | null
  brandLogoSrc: string | null
  crowd: string | null
  hasMatch: boolean
}

const RED = '#dc2626'
const TEXT = '#171717'
const MUTED = '#52525b'

/** Facebook / WhatsApp crop extra margin; title block max 760px centered */
const SAFE_PAD_X = 110
const CONTENT_MAX_W = 900
const TITLE_MAX_W = 760
const CREST_BOX = 200
const CREST_INNER = 156
/** Keeps crest + VS cluster off the horizontal crop zone */
const CREST_ROW_MAX_W = 680

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

/** Wrapped match title "{home} vs {away}" — font 34–42px by combined length */
function matchTitleFontSize(home: string, away: string): number {
  const len = home.length + away.length + 5
  if (len > 56) return 34
  if (len > 42) return 38
  return 42
}

function CrestCard({
  logoSrc,
  teamName,
  crestBox,
  crestInner,
}: {
  logoSrc: string | null
  teamName: string
  crestBox: number
  crestInner: number
}) {
  return (
    <div
      style={{
        width: crestBox,
        height: crestBox,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        background: '#ffffff',
        border: '2px solid #e2e8f0',
      }}
    >
      {logoSrc ? (
        <img src={logoSrc} alt="" width={crestInner} height={crestInner} style={{ objectFit: 'contain' }} />
      ) : (
        <span style={{ fontSize: 48, fontWeight: 800, color: '#94a3b8' }}>{initials(teamName)}</span>
      )}
    </div>
  )
}

function BrandBlock({ brandLogoSrc }: { brandLogoSrc: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', height: 64, alignItems: 'center' }}>
      {brandLogoSrc ? (
        <img src={brandLogoSrc} alt="" width={300} height={64} style={{ objectFit: 'contain' }} />
      ) : (
        <span style={{ fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>NextPlay Predictor</span>
      )}
    </div>
  )
}

function BrandedFallbackHero() {
  return (
    <>
      <div style={{ fontSize: 36, fontWeight: 800, color: TEXT, letterSpacing: -0.5, textAlign: 'center' }}>
        One Match Challenge
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: MUTED, textAlign: 'center', maxWidth: CONTENT_MAX_W }}>
        Predict the winner and margin
      </div>
      <div style={{ width: 120, height: 4, borderRadius: 4, background: RED, marginTop: 8 }} />
    </>
  )
}

function MatchOgCard({ payload }: { payload: MatchOgPayload }) {
  const { home, away, kickoff, homeLogoSrc, awayLogoSrc, brandLogoSrc, crowd, hasMatch } = payload
  const titleSize = hasMatch ? matchTitleFontSize(home, away) : 38
  const crestBox = CREST_BOX
  const crestInner = CREST_INNER
  const matchTitle = `${home} vs ${away}`

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: TEXT,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: `32px ${SAFE_PAD_X}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: CONTENT_MAX_W,
          gap: 18,
        }}
      >
        <BrandBlock brandLogoSrc={brandLogoSrc} />

        {hasMatch ? (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <CrestRow
              home={home}
              away={away}
              homeLogoSrc={homeLogoSrc}
              awayLogoSrc={awayLogoSrc}
              crestBox={crestBox}
              crestInner={crestInner}
            />

            <div
              style={{
                width: '100%',
                maxWidth: TITLE_MAX_W,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: titleSize,
                  fontWeight: 800,
                  color: TEXT,
                  letterSpacing: -0.2,
                  lineHeight: 1.3,
                  textAlign: 'center',
                  whiteSpace: 'normal',
                  maxWidth: TITLE_MAX_W,
                }}
              >
                {matchTitle}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                width: '100%',
                maxWidth: TITLE_MAX_W,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 600, color: MUTED, textAlign: 'center', lineHeight: 1.35 }}>
                {kickoff}
              </span>
              {crowd ? <CrowdLine crowd={crowd} /> : null}
            </div>
          </div>
        ) : (
          <BrandedFallbackHero />
        )}
      </div>
    </div>
  )
}

function CrestRow({
  home,
  away,
  homeLogoSrc,
  awayLogoSrc,
  crestBox,
  crestInner,
}: {
  home: string
  away: string
  homeLogoSrc: string | null
  awayLogoSrc: string | null
  crestBox: number
  crestInner: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: CREST_ROW_MAX_W,
        gap: 10,
        marginTop: 4,
      }}
    >
      <CrestCard logoSrc={homeLogoSrc} teamName={home} crestBox={crestBox} crestInner={crestInner} />
      <div style={{ fontSize: 32, fontWeight: 800, color: RED, letterSpacing: '0.06em' }}>VS</div>
      <CrestCard logoSrc={awayLogoSrc} teamName={away} crestBox={crestBox} crestInner={crestInner} />
    </div>
  )
}

function CrowdLine({ crowd }: { crowd: string }) {
  return (
    <div
      style={{
        fontSize: 18,
        fontWeight: 500,
        color: '#64748b',
        marginTop: 4,
        textAlign: 'center',
        width: TITLE_MAX_W,
        lineHeight: 1.35,
      }}
    >
      {crowd}
    </div>
  )
}

async function buildMatchOgPayload(slug: string): Promise<MatchOgPayload> {
  const base = getPublicSiteUrl()
  const normalizedSlug = normalizeOneMatchSlug(slug)
  const match = await fetchOneMatchOgBySlug(normalizedSlug)

  const home = match?.home_team ?? ''
  const away = match?.away_team ?? ''
  const kickoff = match ? formatOneMatchKickoffOg(match.kickoff_time) : 'NextPlay Predictor'

  const [brandLogoSrc, homeLogoSrc, awayLogoSrc] = await Promise.all([
    fetchImageAsDataUrl(`${base}${PLATFORM_LOGO_SRC}`),
    match?.home_team_logo ? fetchImageAsDataUrl(match.home_team_logo) : Promise.resolve(null),
    match?.away_team_logo ? fetchImageAsDataUrl(match.away_team_logo) : Promise.resolve(null),
  ])

  console.info('[one-match-og-image]', {
    requestedSlug: slug,
    normalizedSlug,
    hasMatch: Boolean(match),
    homeLogoLoaded: Boolean(homeLogoSrc),
    awayLogoLoaded: Boolean(awayLogoSrc),
    brandLogoLoaded: Boolean(brandLogoSrc),
  })

  return {
    home,
    away,
    kickoff,
    homeLogoSrc,
    awayLogoSrc,
    brandLogoSrc,
    crowd: match?.crowd_line ?? null,
    hasMatch: Boolean(match),
  }
}

function renderOgImage(payload: MatchOgPayload) {
  return new ImageResponse(<MatchOgCard payload={payload} />, {
    ...size,
    headers: {
      'Cache-Control': OG_CACHE_CONTROL,
      'Content-Type': 'image/png',
    },
  })
}

async function buildBrandedFallbackPayload(): Promise<MatchOgPayload> {
  const base = getPublicSiteUrl()
  const brandLogoSrc = await fetchImageAsDataUrl(`${base}${PLATFORM_LOGO_SRC}`)
  return {
    home: '',
    away: '',
    kickoff: 'NextPlay Predictor',
    homeLogoSrc: null,
    awayLogoSrc: null,
    brandLogoSrc,
    crowd: null,
    hasMatch: false,
  }
}

export default async function OpenGraphImage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = normalizeOneMatchSlug(rawSlug)
  console.log("OG CLEAN LAYOUT ACTIVE")

  try {
    const payload = await buildMatchOgPayload(slug)
    return renderOgImage(payload)
  } catch (err) {
    console.error('[one-match-og-image] render error', { slug, err })
    const fallback = await buildBrandedFallbackPayload()
    return renderOgImage(fallback)
  }
}
