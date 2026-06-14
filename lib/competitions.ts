import type { SupabaseClient } from '@supabase/supabase-js'

export type CompetitionMode = 'custom_pool_fixtures' | 'official_fixed_fixtures'

export type Competition = {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  sport_type: string
  competition_mode: CompetitionMode
  is_active: boolean
  display_order: number
}

export const SCHOOLS_COMPETITION_SLUG = 'nextplay-schools'

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
