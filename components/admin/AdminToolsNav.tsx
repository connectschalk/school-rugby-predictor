'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/predictor', label: 'Predictor' },
  { href: '/rankings', label: 'Rankings tool' },
  { href: '/consistency', label: 'Consistency' },
  { href: '/network', label: 'Graph' },
  { href: '/results', label: 'Scores / Results' },
  { href: '/admin/game-matches', label: 'Game matches' },
  { href: '/tools', label: 'Tools hub' },
] as const

export default function AdminToolsNav() {
  const pathname = usePathname()

  return (
    <nav
      className="border-b border-gray-200 bg-[#111318] text-white"
      aria-label="Admin tools"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2.5 sm:gap-2 sm:px-6">
        {LINKS.map((item) => {
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 sm:px-3 sm:text-sm ${
                active
                  ? 'bg-red-700 text-white'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
