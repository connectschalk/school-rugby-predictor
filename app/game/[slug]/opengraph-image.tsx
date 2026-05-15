import { ImageResponse } from 'next/og'
import { fetchOneMatchOgBySlug, formatOneMatchKickoffOg } from '@/lib/one-match-og'
import { normalizeOneMatchSlug } from '@/lib/one-match-challenge-lookup'
import { fetchImageAsDataUrl } from '@/lib/og-image-data-url'
import { getPublicSiteUrl } from '@/lib/site-url'

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function headlineFontSize(home: string, away: string): number {
  const len = home.length + away.length + 4
  if (len > 56) return 32
  if (len > 44) return 38
  return 44
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={RED} strokeWidth="2" />
      <path d="M3 10h18" stroke={RED} strokeWidth="2" />
      <path d="M8 3v4M16 3v4" stroke={RED} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
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
        borderRadius: 20,
        background: '#ffffff',
        border: '2px solid #e2e8f0',
      }}
    >
      {logoSrc ? (
        <img src={logoSrc} alt="" width={crestInner} height={crestInner} style={{ objectFit: 'contain' }} />
      ) : (
        <span style={{ fontSize: 80, fontWeight: 800, color: '#94a3b8' }}>{initials(teamName)}</span>
      )}
    </div>
  )
}

function BrandBlock({ brandLogoSrc }: { brandLogoSrc: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', height: 72, alignItems: 'center' }}>
      {brandLogoSrc ? (
        <img src={brandLogoSrc} alt="" width={360} height={72} style={{ objectFit: 'contain' }} />
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
      <div style={{ fontSize: 22, fontWeight: 600, color: MUTED, textAlign: 'center', maxWidth: 720 }}>
        Predict the winner and margin
      </div>
      <div style={{ width: 120, height: 4, borderRadius: 4, background: RED, marginTop: 8 }} />
    </>
  )
}

function MatchOgCard({ payload }: { payload: MatchOgPayload }) {
  const { home, away, kickoff, homeLogoSrc, awayLogoSrc, brandLogoSrc, crowd, hasMatch } = payload
  const headlineSize = hasMatch ? headlineFontSize(home, away) : 40
  const crestBox = 310
  const crestInner = crestBox - 56

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: hasMatch ? 'flex-start' : 'center',
        background: '#f8fafc',
        color: TEXT,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: '36px 56px 44px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          gap: 22,
        }}
      >
        <BrandBlock brandLogoSrc={brandLogoSrc} />

        {hasMatch ? (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                maxWidth: 1100,
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: headlineSize, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>{home}</span>
              <span
                style={{
                  fontSize: Math.max(26, Math.round(headlineSize * 0.55)),
                  fontWeight: 800,
                  color: RED,
                  letterSpacing: '0.06em',
                }}
              >
                VS
              </span>
              <span style={{ fontSize: headlineSize, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>{away}</span>
            </div>

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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <CalendarIcon />
                <span style={{ fontSize: 22, fontWeight: 700, color: RED, letterSpacing: '0.02em' }}>Kickoff</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 600, color: MUTED }}>{kickoff}</div>
              {crowd ? (
                <CrowdLine crowd={crowd} />
              ) : null}
            </div>
          </>
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
        gap: 28,
        marginTop: 6,
      }}
    >
      <CrestCard logoSrc={homeLogoSrc} teamName={home} crestBox={crestBox} crestInner={crestInner} />
      <div style={{ fontSize: 44, fontWeight: 800, color: RED, letterSpacing: '0.08em' }}>VS</div>
      <CrestCard logoSrc={awayLogoSrc} teamName={away} crestBox={crestBox} crestInner={crestInner} />
    </div>
  )
}

function CrowdLine({ crowd }: { crowd: string }) {
  return <div style={{ fontSize: 20, fontWeight: 500, color: '#64748b', marginTop: 6 }}>{crowd}</div>
}

async function buildMatchOgPayload(slug: string): Promise<MatchOgPayload> {
  const base = getPublicSiteUrl()
  const normalizedSlug = normalizeOneMatchSlug(slug)
  const match = await fetchOneMatchOgBySlug(normalizedSlug)

  const home = match?.home_team ?? ''
  const away = match?.away_team ?? ''
  const kickoff = match ? formatOneMatchKickoffOg(match.kickoff_time) : 'School rugby predictions'

  const [brandLogoSrc, homeLogoSrc, awayLogoSrc] = await Promise.all([
    fetchImageAsDataUrl(`${base}/nextplay-predictor.png`),
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
  const brandLogoSrc = await fetchImageAsDataUrl(`${base}/nextplay-predictor.png`)
  return {
    home: '',
    away: '',
    kickoff: 'School rugby predictions',
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

  try {
    const payload = await buildMatchOgPayload(slug)
    return renderOgImage(payload)
  } catch (err) {
    console.error('[one-match-og-image] render error', { slug, err })
    const fallback = await buildBrandedFallbackPayload()
    return renderOgImage(fallback)
  }
}
