import type { SupabaseClient } from '@supabase/supabase-js'
import type { Competition } from '@/lib/competitions'

export type CompetitionAdminStats = {
  fixtureCount: number
  poolCount: number
  completedFixtureCount: number
}

export async function fetchCompetitionAdminStats(
  client: SupabaseClient,
  competitionId: string
): Promise<{ stats: CompetitionAdminStats; error: string | null }> {
  const [fixturesRes, poolsRes, completedRes] = await Promise.all([
    client
      .from('game_matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', competitionId),
    client.from('pools').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId),
    client
      .from('game_matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
      .eq('status', 'completed'),
  ])

  if (fixturesRes.error) return { stats: { fixtureCount: 0, poolCount: 0, completedFixtureCount: 0 }, error: fixturesRes.error.message }
  if (poolsRes.error) return { stats: { fixtureCount: 0, poolCount: 0, completedFixtureCount: 0 }, error: poolsRes.error.message }
  if (completedRes.error) return { stats: { fixtureCount: 0, poolCount: 0, completedFixtureCount: 0 }, error: completedRes.error.message }

  return {
    stats: {
      fixtureCount: fixturesRes.count ?? 0,
      poolCount: poolsRes.count ?? 0,
      completedFixtureCount: completedRes.count ?? 0,
    },
    error: null,
  }
}

export async function fetchAllCompetitionsForAdmin(
  client: SupabaseClient
): Promise<{ competitions: Competition[]; error: string | null }> {
  const { data, error } = await client
    .from('competitions')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) return { competitions: [], error: error.message }

  const competitions = (data ?? [])
    .map((row) => {
      const mode = row.competition_mode
      if (mode !== 'custom_pool_fixtures' && mode !== 'official_fixed_fixtures') return null
      if (!row.id || !row.slug || !row.name) return null
      return {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        description: row.description != null ? String(row.description) : null,
        logo_url: row.logo_url != null ? String(row.logo_url) : null,
        hero_image_url: row.hero_image_url != null ? String(row.hero_image_url) : null,
        sport_type: String(row.sport_type ?? ''),
        competition_mode: mode,
        scoring_mode: row.scoring_mode === 'soccer_exact_score' ? 'soccer_exact_score' : 'rugby_margin',
        is_active: Boolean(row.is_active),
        display_order: Number(row.display_order ?? 0),
      } satisfies Competition
    })
    .filter((c): c is Competition => c != null)

  return { competitions, error: null }
}

import { venueFromAdminNotes } from '@/lib/admin-competition-fixture-api'

export type AdminFixtureRow = {
  id: string
  kickoff_time: string
  home_team: string
  away_team: string
  status: string
  home_score: number | null
  away_score: number | null
  penalty_winner: string | null
  external_id: string | null
  fixture_round: string | null
  league_group: string | null
  admin_notes: string | null
}

export function adminFixtureVenue(row: Pick<AdminFixtureRow, 'admin_notes'>): string {
  return venueFromAdminNotes(row.admin_notes)
}

export async function fetchCompetitionFixtures(
  client: SupabaseClient,
  competitionId: string,
  options: { status?: string; limit?: number } = {}
): Promise<{ fixtures: AdminFixtureRow[]; error: string | null }> {
  let q = client
    .from('game_matches')
    .select(
      'id, kickoff_time, home_team, away_team, status, home_score, away_score, penalty_winner, external_id, fixture_round, league_group, admin_notes'
    )
    .eq('competition_id', competitionId)
    .order('kickoff_time', { ascending: true })

  if (options.status) q = q.eq('status', options.status)
  if (options.limit) q = q.limit(options.limit)

  const { data, error } = await q
  if (error) return { fixtures: [], error: error.message }
  return { fixtures: (data as AdminFixtureRow[]) ?? [], error: null }
}

export type AdminPoolRow = {
  id: string
  name: string
  is_closed: boolean
  created_at: string
}

export async function fetchCompetitionPools(
  client: SupabaseClient,
  competitionId: string,
  limit = 50
): Promise<{ pools: AdminPoolRow[]; error: string | null }> {
  const { data, error } = await client
    .from('pools')
    .select('id, name, is_closed, created_at')
    .eq('competition_id', competitionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { pools: [], error: error.message }
  return { pools: (data as AdminPoolRow[]) ?? [], error: null }
}
