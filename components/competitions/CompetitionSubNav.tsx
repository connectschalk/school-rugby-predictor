'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  Layers,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { isCompetitionNavActive, type CompetitionNavTarget } from '@/lib/competition-nav'

type Props = {
  competitionSlug: string
  competitionName: string
  variant?: 'light' | 'dark'
}

const NAV_ITEMS: {
  target: CompetitionNavTarget
  segment: string
  label: string
  icon: LucideIcon
}[] = [
  { target: 'predict', segment: 'predict', label: 'Predict', icon: Target },
  { target: 'community', segment: 'community', label: 'Community Picks', icon: Users },
  { target: 'fixtures', segment: 'fixtures', label: 'Fixtures', icon: CalendarDays },
  { target: 'leaderboard', segment: 'leaderboard', label: 'Rankings', icon: Trophy },
  { target: 'pools', segment: 'pools', label: 'Pools', icon: Layers },
]

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 shrink-0 stroke-[2] text-red-500" aria-hidden />
}

/** Competition-local nav — active section pill on mobile (main sections live in top header). */
export default function CompetitionSubNav({
  competitionSlug,
  competitionName,
  variant = 'light',
}: Props) {
  const pathname = usePathname()
  const base = `/competitions/${competitionSlug}`
  const isDark = variant === 'dark'
  const activeItem = NAV_ITEMS.find((item) => isCompetitionNavActive(pathname, item.target))

  return (
    <nav
      className={`lg:hidden ${
        isDark
          ? 'border-b border-white/10 bg-[#0a0a0b] text-white'
          : 'border-b border-slate-200 bg-white text-slate-900'
      }`}
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
        {activeItem ? (
          <Link
            href={`${base}/${activeItem.segment}`}
            className={
              isDark
                ? 'inline-flex items-center gap-2 rounded-full border border-white/70 bg-transparent px-4 py-1.5 text-sm font-bold text-white'
                : 'inline-flex items-center gap-2 rounded-full border border-slate-900 bg-transparent px-4 py-1.5 text-sm font-bold text-slate-900'
            }
          >
            <NavIcon icon={activeItem.icon} />
            <span>{activeItem.label}</span>
          </Link>
        ) : null}
      </div>
    </nav>
  )
}
