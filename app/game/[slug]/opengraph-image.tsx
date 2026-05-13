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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function titleFontSize(home: string, away: string): number {
  const len = home.length + away.length + 4
  if (len > 52) return 34
  if (len > 40) return 40
  return 46
}

export default async function OpenGraphImage({ params }: Props) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const base = getPublicSiteUrl()
  const match = await fetchOneMatchOgBySlug(slug)

  const home = match?.home_team ?? 'NextPlay'
  const away = match?.away_team ?? 'Predictor'
  const kickoff = match ? formatOneMatchKickoffOg(match.kickoff_time) : 'School rugby predictions'
  const homeLogo = match?.home_team_logo
  const awayLogo = match?.away_team_logo
  const crowd = match?.crowd_line
  const titleSize = match ? titleFontSize(home, away) : 44

  const logoBox = 280

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(165deg, #0a0e14 0%, #121a24 45%, #0d1219 100%)',
          color: '#f1f5f9',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          padding: 48,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            flex: 1,
            justifyContent: 'center',
            gap: 28,
          }}
        >
          <div
            style={{
              fontSize: 22,
              letterSpacing: '0.35em',
              textTransform: 'uppercase',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            NextPlay Predictor
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              gap: 36,
            }}
          >
            <div
              style={{
                width: logoBox,
                height: logoBox,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(148,163,184,0.25)',
              }}
            >
              {homeLogo ? (
                <img
                  src={homeLogo}
                  alt=""
                  width={logoBox - 48}
                  height={logoBox - 48}
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: 72, fontWeight: 700, color: '#e2e8f0' }}>{initials(home)}</span>
              )}
            </div>

            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: '#d4a853',
                fontStyle: 'italic',
                textShadow: '0 2px 24px rgba(212,168,83,0.35)',
              }}
            >
              VS
            </div>

            <div
              style={{
                width: logoBox,
                height: logoBox,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(148,163,184,0.25)',
              }}
            >
              {awayLogo ? (
                <img
                  src={awayLogo}
                  alt=""
                  width={logoBox - 48}
                  height={logoBox - 48}
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: 72, fontWeight: 700, color: '#e2e8f0' }}>{initials(away)}</span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              maxWidth: 1080,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15 }}>
              {match ? `${home} vs ${away}` : 'Match not found'}
            </div>
            <div style={{ fontSize: 30, color: '#cbd5e1', fontWeight: 500 }}>{kickoff}</div>
            {crowd ? (
              <div style={{ fontSize: 22, color: '#94a3b8', marginTop: 4 }}>{crowd}</div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.85 }}>
          <img src={`${base}/nextplay-predictor.png`} alt="" height={36} style={{ objectFit: 'contain' }} />
        </div>
      </div>
    ),
    { ...size }
  )
}
