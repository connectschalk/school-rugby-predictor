import { ImageResponse } from 'next/og'
import { fetchOneMatchOgBySlug, formatOneMatchKickoffOg } from '@/lib/one-match-og'
import { getPublicSiteUrl } from '@/lib/site-url'

export const runtime = 'edge'

export const alt = 'Match preview'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Cache for crawlers (WhatsApp, Facebook); slug-specific via path. */
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

const RED = '#dc2626'
const TEXT = '#171717'
const MUTED = '#52525b'
const CARD_SHADOW = '0 10px 40px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)'

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

export default async function OpenGraphImage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const base = getPublicSiteUrl()
  const match = await fetchOneMatchOgBySlug(slug)

  const home = match?.home_team ?? ''
  const away = match?.away_team ?? ''
  const kickoff = match ? formatOneMatchKickoffOg(match.kickoff_time) : 'School rugby predictions'
  const homeLogo = match?.home_team_logo
  const awayLogo = match?.away_team_logo
  const crowd = match?.crowd_line
  const headlineSize = match ? headlineFontSize(home, away) : 40

  const crestBox = 310
  const crestInner = crestBox - 56

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 48%, #f1f5f9 100%)',
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
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <img
              src={`${base}/nextplay-predictor.png`}
              alt=""
              height={72}
              style={{ objectFit: 'contain', height: 72, width: 'auto', maxWidth: 420 }}
            />
          </div>

          {match ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
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
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, color: TEXT, letterSpacing: -0.4 }}>Match not found</div>
          )}

          {match ? (
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
              <div
                style={{
                  width: crestBox,
                  height: crestBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  background: '#ffffff',
                  boxShadow: CARD_SHADOW,
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                }}
              >
                {homeLogo ? (
                  <img
                    src={homeLogo}
                    alt=""
                    width={crestInner}
                    height={crestInner}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: 80, fontWeight: 800, color: '#94a3b8' }}>{initials(home)}</span>
                )}
              </div>

              <div
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  color: RED,
                  letterSpacing: '0.08em',
                }}
              >
                VS
              </div>

              <div
                style={{
                  width: crestBox,
                  height: crestBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  background: '#ffffff',
                  boxShadow: CARD_SHADOW,
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                }}
              >
                {awayLogo ? (
                  <img
                    src={awayLogo}
                    alt=""
                    width={crestInner}
                    height={crestInner}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: 80, fontWeight: 800, color: '#94a3b8' }}>{initials(away)}</span>
                )}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <CalendarIcon />
              <span style={{ fontSize: 22, fontWeight: 700, color: RED, letterSpacing: '0.02em' }}>Kickoff</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: MUTED }}>{kickoff}</div>
            {crowd ? (
              <div style={{ fontSize: 20, fontWeight: 500, color: '#64748b', marginTop: 6 }}>{crowd}</div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
