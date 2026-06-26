import type { NextConfig } from 'next'

const OG_IMAGE_CACHE =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'

const SCHOOLS = 'nextplay-schools'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/game/:slug/opengraph-image',
        headers: [{ key: 'Cache-Control', value: OG_IMAGE_CACHE }],
      },
      {
        source: '/api/og/pool/:token',
        headers: [{ key: 'Cache-Control', value: OG_IMAGE_CACHE }],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/predict-score',
        destination: `/competitions/${SCHOOLS}/predict`,
        permanent: false,
      },
      {
        source: '/predict-score/:path*',
        destination: `/competitions/${SCHOOLS}/predict/:path*`,
        permanent: false,
      },
      {
        source: '/pools/manage',
        destination: `/competitions/${SCHOOLS}/pools/create`,
        permanent: false,
      },
      {
        source: '/pools/invite/:path*',
        destination: `/competitions/${SCHOOLS}/pools/invite/:path*`,
        permanent: false,
      },
      {
        source: '/pools',
        destination: `/competitions/${SCHOOLS}/pools`,
        permanent: false,
      },
      {
        source: '/user-rankings',
        destination: `/competitions/${SCHOOLS}/leaderboard`,
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: `/competitions/${SCHOOLS}/pools/create`,
        destination: '/pools/manage',
      },
      {
        source: `/competitions/${SCHOOLS}/pools/invite/:path*`,
        destination: '/pools/invite/:path*',
      },
    ]
  },
}

export default nextConfig
