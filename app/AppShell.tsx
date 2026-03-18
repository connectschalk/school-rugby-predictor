'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AppShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isHomePage = pathname === '/' || pathname === '/predictor'

  if (isHomePage) {
    return <>{children}</>
  }

  return (
    <>
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-4">
            <Image
              src="/nextplay-predictor.png"
              alt="NextPlay Predictor"
              width={240}
              height={80}
              priority
            />
          </Link>

          <nav className="flex gap-6 text-sm font-medium">
            <Link href="/predictor" className="hover:underline">
              Predictor
            </Link>
            <Link href="/results" className="hover:underline">
              Results
            </Link>
            <Link href="/rankings" className="hover:underline">
              Rankings
            </Link>
            <Link href="/network" className="hover:underline">
              Visual Graph
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="mt-20 border-t border-gray-200">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-gray-600">
          Contact:
          <a
            href="mailto:info@thenextplay.co.za"
            className="ml-1 text-black hover:underline"
          >
            info@thenextplay.co.za
          </a>
        </div>
      </footer>
    </>
  )
}