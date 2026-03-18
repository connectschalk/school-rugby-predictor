import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NextPlay Predictor',
  description: 'School Rugby Predictor',
}

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