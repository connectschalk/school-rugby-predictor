import type { Competition, CompetitionMode } from '@/lib/competitions'
import { PLATFORM_LOGO_SRC } from '@/lib/platform-branding'

/** Local fallbacks when `competitions.logo_url` is null. */
export const COMPETITION_LOGO_FALLBACKS: Record<string, string> = {
  'nextplay-schools': '/competition-logos/school-rugby-predictor.png',
  'craven-week': '/competition-logos/craven-week-rugby-predictor.png',
  'soccer-world-cup': '/competition-logos/soccer-world-cup-predictor.png',
}

export const DEFAULT_COMPETITION_LOGO = PLATFORM_LOGO_SRC

export function competitionLogoSrc(competition: Pick<Competition, 'slug' | 'logo_url'>): string {
  if (competition.logo_url?.trim()) return competition.logo_url.trim()
  return COMPETITION_LOGO_FALLBACKS[competition.slug] ?? DEFAULT_COMPETITION_LOGO
}

export function competitionHeroSrc(competition: Pick<Competition, 'slug' | 'hero_image_url'>): string | null {
  if (competition.hero_image_url?.trim()) return competition.hero_image_url.trim()
  return null
}

/** Short landing-card copy (product door taglines). */
export function competitionTagline(slug: string): string {
  const taglines: Record<string, string> = {
    'nextplay-schools': 'Build your own school rugby pool.',
    'craven-week': 'Predict the official Craven Week fixtures.',
    'soccer-world-cup': 'Create your World Cup pool and predict every match.',
  }
  return taglines[slug] ?? 'Create a pool and predict every match.'
}

export function competitionModeBadge(mode: CompetitionMode): string {
  return mode === 'custom_pool_fixtures' ? 'Custom pools' : 'Official fixtures'
}

export function competitionCreateCta(slug: string, mode: CompetitionMode): string {
  if (mode === 'custom_pool_fixtures' && slug === 'nextplay-schools') {
    return 'Create your own pool'
  }
  return 'Create pool'
}

export function isOfficialCompetition(mode: CompetitionMode): boolean {
  return mode === 'official_fixed_fixtures'
}
