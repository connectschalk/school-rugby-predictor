import { describe, expect, it } from 'vitest'
import {
  COMPETITION_EVENT_VISIBILITY,
  CRAVEN_WEEK_SLUG,
  filterLandingFeaturedCompetitions,
  isLandingFeaturedCompetitionSlug,
  isPastEventCompetitionSlug,
  LANDING_FALLBACK_COMPETITION_SLUG,
  LANDING_FEATURED_COMPETITION_SLUGS,
  landingFeaturedGridClassName,
  PAST_EVENT_COMPETITIONS,
  resolveLandingFeaturedCompetitions,
  SCHOOLS_COMPETITION_SLUG,
  SOCCER_WORLD_CUP_SLUG,
  withEventDemotedToPast,
  type Competition,
  type CompetitionEventConfig,
} from '@/lib/competitions'
import {
  ACTIVE_COMPETITION_SWITCHER_OPTIONS,
  PAST_EVENT_SWITCHER_OPTIONS,
} from '@/lib/competition-nav'

function stubCompetition(slug: string, display_order: number): Competition {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    description: null,
    logo_url: null,
    hero_image_url: null,
    sport_type: 'rugby',
    competition_mode: 'official_fixed_fixtures',
    scoring_mode: 'rugby_margin',
    is_active: true,
    display_order,
  }
}

function featuredSlugsFrom(events: readonly CompetitionEventConfig[]): string[] {
  return events
    .filter((e) => e.visibility === 'featured')
    .sort((a, b) => a.order - b.order)
    .map((e) => e.slug)
}

function pastSlugsFrom(events: readonly CompetitionEventConfig[]): string[] {
  return events
    .filter((e) => e.visibility === 'past')
    .sort((a, b) => a.order - b.order)
    .map((e) => e.slug)
}

describe('landing event visibility', () => {
  it('current state: landing features Soccer World Cup and Schools Rugby Predictor', () => {
    expect([...LANDING_FEATURED_COMPETITION_SLUGS]).toEqual([
      SOCCER_WORLD_CUP_SLUG,
      SCHOOLS_COMPETITION_SLUG,
    ])
    expect(isLandingFeaturedCompetitionSlug(SOCCER_WORLD_CUP_SLUG)).toBe(true)
    expect(isLandingFeaturedCompetitionSlug(SCHOOLS_COMPETITION_SLUG)).toBe(true)
  })

  it('current state: Craven Week is not a landing card', () => {
    expect(isLandingFeaturedCompetitionSlug(CRAVEN_WEEK_SLUG)).toBe(false)
    const rows = [
      stubCompetition(SCHOOLS_COMPETITION_SLUG, 1),
      stubCompetition(CRAVEN_WEEK_SLUG, 2),
      stubCompetition(SOCCER_WORLD_CUP_SLUG, 3),
    ]
    expect(filterLandingFeaturedCompetitions(rows).map((c) => c.slug)).toEqual([
      SOCCER_WORLD_CUP_SLUG,
      SCHOOLS_COMPETITION_SLUG,
    ])
  })

  it('current state: Craven Week appears under Past events with route intact', () => {
    expect(isPastEventCompetitionSlug(CRAVEN_WEEK_SLUG)).toBe(true)
    expect(PAST_EVENT_COMPETITIONS).toEqual([
      {
        slug: CRAVEN_WEEK_SLUG,
        label: 'Craven Week',
        href: '/competitions/craven-week',
        statusLabel: 'Completed',
      },
    ])
    expect(PAST_EVENT_SWITCHER_OPTIONS.map((o) => o.slug)).toEqual([CRAVEN_WEEK_SLUG])
    expect(ACTIVE_COMPETITION_SWITCHER_OPTIONS.map((o) => o.slug)).not.toContain(CRAVEN_WEEK_SLUG)
  })

  it('supports demoting Soccer World Cup to Past events without route deletion', () => {
    const future = withEventDemotedToPast(COMPETITION_EVENT_VISIBILITY, SOCCER_WORLD_CUP_SLUG)
    expect(featuredSlugsFrom(future)).toEqual([SCHOOLS_COMPETITION_SLUG])
    expect(pastSlugsFrom(future)).toEqual([CRAVEN_WEEK_SLUG, SOCCER_WORLD_CUP_SLUG])

    const worldCup = future.find((e) => e.slug === SOCCER_WORLD_CUP_SLUG)!
    expect(worldCup.visibility).toBe('past')
    expect(`/competitions/${worldCup.slug}`).toBe('/competitions/soccer-world-cup')
    expect(`/competitions/${CRAVEN_WEEK_SLUG}`).toBe('/competitions/craven-week')

    // Live config is unchanged until the TODO edit is made.
    expect(isLandingFeaturedCompetitionSlug(SOCCER_WORLD_CUP_SLUG)).toBe(true)
    expect(isPastEventCompetitionSlug(SOCCER_WORLD_CUP_SLUG)).toBe(false)
  })

  it('falls back to Schools when featured list resolves to zero cards', () => {
    expect(LANDING_FALLBACK_COMPETITION_SLUG).toBe(SCHOOLS_COMPETITION_SLUG)

    const rows = [
      stubCompetition(CRAVEN_WEEK_SLUG, 1),
      stubCompetition(SCHOOLS_COMPETITION_SLUG, 2),
      stubCompetition(SOCCER_WORLD_CUP_SLUG, 3),
    ]

    // Simulate post–World Cup config: no featured slugs configured.
    const zeroFeatured = resolveLandingFeaturedCompetitions([], rows)
    expect(zeroFeatured.map((c) => c.slug)).toEqual([SCHOOLS_COMPETITION_SLUG])

    // Simulate demoted World Cup: only Schools remains featured.
    const future = withEventDemotedToPast(COMPETITION_EVENT_VISIBILITY, SOCCER_WORLD_CUP_SLUG)
    const futureFeatured = featuredSlugsFrom(future)
    expect(
      resolveLandingFeaturedCompetitions(futureFeatured, rows).map((c) => c.slug)
    ).toEqual([SCHOOLS_COMPETITION_SLUG])
  })

  it('uses a single-card-friendly landing grid when only one featured event remains', () => {
    expect(landingFeaturedGridClassName(1)).toContain('max-w-lg')
    expect(landingFeaturedGridClassName(1)).not.toContain('sm:grid-cols-2')
    expect(landingFeaturedGridClassName(2)).toContain('sm:grid-cols-2')
    expect(landingFeaturedGridClassName(3)).toContain('lg:grid-cols-3')
  })
})
