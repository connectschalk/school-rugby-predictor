import type { NextConfig } from 'next'

const OG_IMAGE_CACHE =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/game/:slug/opengraph-image',
        headers: [{ key: 'Cache-Control', value: OG_IMAGE_CACHE }],
      },
    ]
  },
}

export default nextConfig
