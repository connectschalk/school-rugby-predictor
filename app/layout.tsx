import './globals.css'
import type { Metadata } from 'next'

import { getPublicSiteUrl } from '@/lib/site-url'
import { buildPlatformSiteMetadata } from '@/lib/platform-branding'

export const metadataBase = new URL(getPublicSiteUrl())

export const metadata: Metadata = buildPlatformSiteMetadata()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">{children}</body>
    </html>
  )
}