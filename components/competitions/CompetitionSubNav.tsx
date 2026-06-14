'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  competitionSlug: string
  competitionName: string
  variant?: 'light' | 'dark'
}

const LINKS = [
  { segment: 'predict', label: 'Predict' },
  { segment: 'fixtures', label: 'Fixtures' },
  { segment: 'pools', label: 'Pools' },
  { segment: 'leaderboard', label: 'Leaderboard' },
] as const

export default function CompetitionSubNav({
  competitionSlug,
  competitionName,
  variant = 'light',
}: Props) {
  const pathname = usePathname()
  const base = `/competitions/${competitionSlug}`
  const isDark = variant === 'dark'

  return (
    <nav
      className={
        isDark
          ? 'border-b border-white/10 bg-[#0a0a0b] text-white'
          : 'border-b border-slate-200 bg-white text-slate-900'
      }
      aria-label={`${competitionName} navigation`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <Link
          href={base}
          className={
            isDark
              ? 'mr-2 text-xs font-semibold text-gray-400 transition hover:text-white'
              : 'mr-2 text-xs font-semibold text-slate-500 transition hover:text-slate-900'
          }
        >
          {competitionName}
        </Link>
        {LINKS.map(({ segment, label }) => {
          const href = `${base}/${segment}`
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={segment}
              href={href}
              className={
                active
                  ? isDark
                    ? 'rounded-full border border-red-600/50 bg-red-600/20 px-4 py-1.5 text-sm font-bold text-white'
                    : 'rounded-full border border-slate-900 bg-slate-900 px-4 py-1.5 text-sm font-bold text-white'
                  : isDark
                    ? 'rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-gray-300 transition hover:border-white/20 hover:text-white'
                    : 'rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50'
              }
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
