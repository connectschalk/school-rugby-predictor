import { ImageResponse } from '@vercel/og'
import { type NextRequest } from 'next/server'
import {
  absoluteTeamLogoUrl,
  fetchOneMatchOgBySlug,
  formatOneMatchKickoffOg,
} from '@/lib/one-match-og'
import { getPublicSiteUrl } from '@/lib/site-url'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.trim() ?? ''
  const base = getPublicSiteUrl()

  if (!slug) {
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
            color: '#111827',
            fontSize: 40,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          One match challenge
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  const match = await fetchOneMatchOgBySlug(slug)
  if (!match) {
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
            color: '#111827',
            fontSize: 36,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          One match challenge
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  const home = match.home_team
  const away = match.away_team
  const kickoff = formatOneMatchKickoffOg(match.kickoff_time)
  const homeLogo = absoluteTeamLogoUrl(home, base)
  const awayLogo = absoluteTeamLogoUrl(away, base)

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
          background: '#ffffff',
          padding: 56,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 56,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              width: 380,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={homeLogo}
              alt=""
              width={140}
              height={140}
              style={{
                borderRadius: 9999,
                objectFit: 'contain',
                border: '1px solid #e5e7eb',
                background: '#fafafa',
              }}
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: '#111827',
                textAlign: 'center',
                lineHeight: 1.25,
              }}
            >
              {home}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 48,
            }}
          >
            <span style={{ fontSize: 36, fontWeight: 700, color: '#9ca3af' }}>VS</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 20,
              width: 380,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={awayLogo}
              alt=""
              width={140}
              height={140}
              style={{
                borderRadius: 9999,
                objectFit: 'contain',
                border: '1px solid #e5e7eb',
                background: '#fafafa',
              }}
            />
            <span
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: '#111827',
                textAlign: 'center',
                lineHeight: 1.25,
              }}
            >
              {away}
            </span>
          </div>
        </div>

        <div
          style={{
            width: '72%',
            height: 1,
            background: '#e5e7eb',
            marginTop: 40,
            marginBottom: 28,
          }}
        />

        <span style={{ fontSize: 26, color: '#374151', fontWeight: 500 }}>{kickoff}</span>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
