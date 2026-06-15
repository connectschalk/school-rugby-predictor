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
