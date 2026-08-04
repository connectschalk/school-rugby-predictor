import type { SupabaseClient } from '@supabase/supabase-js'

export type CompetitionMode = 'custom_pool_fixtures' | 'official_fixed_fixtures'

export type CompetitionScoringMode = 'rugby_margin' | 'soccer_exact_score'

export type Competition = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  sport_type: string
  competition_mode: CompetitionMode
  scoring_mode: CompetitionScoringMode
  is_active: boolean
  display_order: number
}

export const SCHOOLS_COMPETITION_SLUG = 'nextplay-schools'
export const SOCCER_WORLD_CUP_SLUG = 'soccer-world-cup'
export const CRAVEN_WEEK_SLUG = 'craven-week'

/**
 * Public event visibility for landing cards + burger “Past events”.
 *
 * States:
 * - `featured` → prominent landing card + active competition switcher entry
 * - `active`   → reachable in competition switcher (not a landing card)
 * - `past`     → burger/menu → Past events only (routes/data stay intact)
 *
 * ---------------------------------------------------------------------------
 * CURRENT CONFIG
 * - nextplay-schools   = featured (public landing)
 * - soccer-world-cup   = past (archived from public discovery)
 * - craven-week        = past
 *
 * Archived / past events:
 * - Hidden from landing cards and the active competition switcher
 * - Listed under burger → Past events
 * - Direct routes (`/competitions/{slug}`) and admin stay live
 * - Pools, predictions, and leaderboards are not deleted
 * ---------------------------------------------------------------------------
 */
export type CompetitionEventVisibility = 'featured' | 'active' | 'past'

export type CompetitionEventConfig = {
  slug: string
  label: string
  visibility: CompetitionEventVisibility
  /** Lower = higher priority within the same visibility group. */
  order: number
  statusLabel?: 'Completed' | 'Past event'
}

export const COMPETITION_EVENT_VISIBILITY: readonly CompetitionEventConfig[] = [
  {
    slug: SCHOOLS_COMPETITION_SLUG,
    label: 'School Rugby',
    visibility: 'featured',
    order: 1,
  },
  {
    slug: SOCCER_WORLD_CUP_SLUG,
    label: 'Soccer World Cup',
    visibility: 'past',
    order: 1,
    statusLabel: 'Completed',
  },
  {
    slug: CRAVEN_WEEK_SLUG,
    label: 'Craven Week',
    visibility: 'past',
    order: 2,
    statusLabel: 'Completed',
  },
] as const

/** Default landing door if featured list is empty after filtering. */
export const LANDING_FALLBACK_COMPETITION_SLUG = SCHOOLS_COMPETITION_SLUG

function eventsByVisibility(visibility: CompetitionEventVisibility): CompetitionEventConfig[] {
  return COMPETITION_EVENT_VISIBILITY.filter((e) => e.visibility === visibility).sort(
    (a, b) => a.order - b.order
  )
}

/** Landing-page primary event cards (order = display order on the home page). */
export const LANDING_FEATURED_COMPETITION_SLUGS = eventsByVisibility('featured').map(
  (e) => e.slug
) as readonly string[]

export type LandingFeaturedCompetitionSlug = (typeof LANDING_FEATURED_COMPETITION_SLUGS)[number]

/** Competitions shown in the main switcher (featured + active, not past). */
export function getActiveSwitcherEvents(): CompetitionEventConfig[] {
  return COMPETITION_EVENT_VISIBILITY.filter(
    (e) => e.visibility === 'featured' || e.visibility === 'active'
  ).sort((a, b) => {
    if (a.visibility !== b.visibility) {
      return a.visibility === 'featured' ? -1 : 1
    }
    return a.order - b.order
  })
}

/** Completed / past competitions under burger → Past events. */
export const PAST_EVENT_COMPETITIONS = eventsByVisibility('past').map((e) => ({
  slug: e.slug,
  label: e.label,
  href: `/competitions/${e.slug}`,
  statusLabel: (e.statusLabel ?? 'Completed') as 'Completed' | 'Past event',
}))

export function competitionEventVisibility(
  slug: string
): CompetitionEventVisibility | null {
  const normalized = slug.trim().toLowerCase()
  return COMPETITION_EVENT_VISIBILITY.find((e) => e.slug === normalized)?.visibility ?? null
}

export function isLandingFeaturedCompetitionSlug(slug: string): boolean {
  return competitionEventVisibility(slug) === 'featured'
}

export function isPastEventCompetitionSlug(slug: string): boolean {
  return competitionEventVisibility(slug) === 'past'
}

/**
 * Prefer configured featured order; drop past/active-only events from the landing grid.
 * If nothing featured resolves, fall back to Schools Rugby Predictor when present.
 */
export function resolveLandingFeaturedCompetitions(
  featuredSlugs: readonly string[],
  competitions: Competition[],
  fallbackSlug: string = LANDING_FALLBACK_COMPETITION_SLUG
): Competition[] {
  const bySlug = new Map(competitions.map((c) => [c.slug, c]))
  const ordered: Competition[] = []
  for (const slug of featuredSlugs) {
    const row = bySlug.get(slug)
    if (row) ordered.push(row)
  }
  if (ordered.length > 0) return ordered

  const fallback = bySlug.get(fallbackSlug)
  return fallback ? [fallback] : []
}

export function filterLandingFeaturedCompetitions(
  competitions: Competition[]
): Competition[] {
  return resolveLandingFeaturedCompetitions(
    LANDING_FEATURED_COMPETITION_SLUGS,
    competitions,
    LANDING_FALLBACK_COMPETITION_SLUG
  )
}

/** Tailwind grid classes for 0/1/2+ featured landing cards. */
export function landingFeaturedGridClassName(cardCount: number): string {
  if (cardCount <= 1) {
    return 'mx-auto mt-12 grid w-full max-w-lg flex-1 gap-5'
  }
  if (cardCount === 2) {
    return 'mx-auto mt-12 grid w-full max-w-4xl flex-1 gap-5 sm:grid-cols-2 sm:gap-6'
  }
  return 'mx-auto mt-12 grid w-full max-w-6xl flex-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6'
}

/**
 * Simulate demoting a featured event to past (for tests / future ops checklist).
 * Does not mutate live config — returns a derived visibility list.
 */
export function withEventDemotedToPast(
  events: readonly CompetitionEventConfig[],
  slug: string
): CompetitionEventConfig[] {
  const normalized = slug.trim().toLowerCase()
  const pastCount = events.filter((e) => e.visibility === 'past').length
  return events.map((e) =>
    e.slug === normalized
      ? {
          ...e,
          visibility: 'past' as const,
          order: pastCount + 1,
          statusLabel: e.statusLabel ?? ('Completed' as const),
        }
      : e
  )
}

/** DB value first; slug fallback when migration 084 not applied or column null. */
export function resolveCompetitionScoringMode(
  slug: string,
  fromDb?: unknown
): CompetitionScoringMode {
  if (fromDb === 'soccer_exact_score') return 'soccer_exact_score'
  if (slug.trim().toLowerCase() === SOCCER_WORLD_CUP_SLUG) return 'soccer_exact_score'
  return 'rugby_margin'
}

export function isSoccerExactScoreMode(mode: CompetitionScoringMode | string | null | undefined): boolean {
  return mode === 'soccer_exact_score'
}

function parseCompetition(row: Record<string, unknown>): Competition | null {
  if (!row?.id || !row?.slug || !row?.name) return null
  const mode = row.competition_mode
  if (mode !== 'custom_pool_fixtures' && mode !== 'official_fixed_fixtures') return null
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    logo_url: row.logo_url != null ? String(row.logo_url) : null,
    hero_image_url: row.hero_image_url != null ? String(row.hero_image_url) : null,
    sport_type: String(row.sport_type ?? ''),
    competition_mode: mode,
    scoring_mode: resolveCompetitionScoringMode(String(row.slug), row.scoring_mode),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order ?? 0),
  }
}

export async function getActiveCompetitions(
  client: SupabaseClient
): Promise<{ competitions: Competition[]; error: string | null }> {
  const { data, error } = await client
    .from('competitions')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) return { competitions: [], error: error.message }
  const competitions = (data ?? [])
    .map((r) => parseCompetition(r as Record<string, unknown>))
    .filter((c): c is Competition => c != null)
  return { competitions, error: null }
}

/** Active competitions that should appear as prominent landing cards. */
export async function getLandingFeaturedCompetitions(
  client: SupabaseClient
): Promise<{ competitions: Competition[]; error: string | null }> {
  const { competitions, error } = await getActiveCompetitions(client)
  if (error) return { competitions: [], error }
  return { competitions: filterLandingFeaturedCompetitions(competitions), error: null }
}

export async function getCompetitionBySlug(
  client: SupabaseClient,
  slug: string
): Promise<{ competition: Competition | null; error: string | null }> {
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return { competition: null, error: null }

  const { data, error } = await client
    .from('competitions')
    .select('*')
    .eq('slug', normalized)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return { competition: null, error: error.message }
  if (!data) return { competition: null, error: null }
  return { competition: parseCompetition(data as Record<string, unknown>), error: null }
}

/** Landing card titles (may differ slightly from DB name). */
export function competitionCardTitle(slug: string, fallbackName: string): string {
  const titles: Record<string, string> = {
    'nextplay-schools': 'NextPlay Schools',
    'craven-week': 'Craven Week Rugby Predictor',
    'soccer-world-cup': 'Soccer World Cup Predictor',
  }
  return titles[slug] ?? fallbackName
}
