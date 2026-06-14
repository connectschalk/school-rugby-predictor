import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

export type CompetitionNavTarget =
  | 'predict'
  | 'community'
  | 'leaderboard'
  | 'pools'
  | 'fixtures'
  | 'home'

const TARGET_SEGMENTS: Record<Exclude<CompetitionNavTarget, 'home'>, string> = {
  predict: 'predict',
  community: 'community',
  leaderboard: 'leaderboard',
  pools: 'pools',
  fixtures: 'fixtures',
}

export const COMPETITION_SWITCHER_OPTIONS = [
  { slug: 'nextplay-schools', label: 'School Rugby Predictor' },
  { slug: 'craven-week', label: 'Craven Week Rugby Predictor' },
  { slug: 'soccer-world-cup', label: 'Soccer World Cup Predictor' },
] as const

export function parseCompetitionSlugFromPathname(
  pathname: string | null | undefined
): string | null {
  if (!pathname) return null
  const match = pathname.match(/^\/competitions\/([^/]+)/i)
  return match?.[1]?.toLowerCase() ?? null
}

export function resolveCompetitionSlugFromPathname(
  pathname: string | null | undefined,
  fallback: string = SCHOOLS_COMPETITION_SLUG
): string {
  return parseCompetitionSlugFromPathname(pathname) ?? fallback
}

export function getCompetitionScopedHref(
  pathname: string | null | undefined,
  target: CompetitionNavTarget,
  slug?: string | null
): string {
  const competitionSlug = slug ?? resolveCompetitionSlugFromPathname(pathname)
  if (target === 'home') {
    return `/competitions/${competitionSlug}`
  }
  return `/competitions/${competitionSlug}/${TARGET_SEGMENTS[target]}`
}

export function isCompetitionNavActive(
  pathname: string | null | undefined,
  target: CompetitionNavTarget
): boolean {
  if (!pathname) return false

  const slug = parseCompetitionSlugFromPathname(pathname)
  if (!slug) {
    switch (target) {
      case 'predict':
        return pathname.startsWith('/predict-score')
      case 'community':
        return (
          pathname.startsWith('/community-predictor') ||
          pathname.startsWith('/community-picks')
        )
      case 'leaderboard':
        return pathname.startsWith('/user-rankings')
      case 'pools':
        return pathname.startsWith('/pools')
      default:
        return false
    }
  }

  const base = `/competitions/${slug}`
  if (target === 'home') {
    return pathname === base
  }

  const href = `${base}/${TARGET_SEGMENTS[target]}`
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Preserve section when switching competition (e.g. pools → pools). */
export function getEquivalentCompetitionPath(
  pathname: string | null | undefined,
  newSlug: string
): string {
  const normalized = newSlug.trim().toLowerCase()
  if (!pathname) return `/competitions/${normalized}/predict`

  const currentSlug = parseCompetitionSlugFromPathname(pathname)
  if (!currentSlug) {
    if (pathname.startsWith('/predict-score')) {
      return `/competitions/${normalized}/predict`
    }
    if (pathname.startsWith('/community-predictor') || pathname.startsWith('/community-picks')) {
      return `/competitions/${normalized}/community`
    }
    if (pathname.startsWith('/user-rankings')) {
      return `/competitions/${normalized}/leaderboard`
    }
    if (pathname.startsWith('/pools')) {
      return `/competitions/${normalized}/pools`
    }
    return `/competitions/${normalized}/predict`
  }

  const prefix = `/competitions/${currentSlug}`
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
  if (suffix && suffix !== '/') {
    return `/competitions/${normalized}${suffix}`
  }
  return `/competitions/${normalized}/predict`
}

export function competitionSwitcherLabel(slug: string): string {
  const found = COMPETITION_SWITCHER_OPTIONS.find((o) => o.slug === slug)
  return found?.label ?? slug
}
