import type { SupabaseClient } from '@supabase/supabase-js'

export type GameMatchStatus = 'upcoming' | 'locked' | 'completed'

export type GameMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: GameMatchStatus
  home_score: number | null
  away_score: number | null
  created_at: string
  /** Highlight ordering on Predict a Score (max 10 live upcoming/locked). */
  is_featured?: boolean
  featured_order?: number | null
}

export type UserPredictionRow = {
  id: string
  match_id: string
  user_id: string
  predicted_winner: 'home' | 'away'
  predicted_margin: number
  submitted_at: string
}

export type UserPredictionScoreRow = {
  id: string
  prediction_id: string
  match_id: string
  user_id: string
  winner_correct: boolean
  actual_winner: string
  actual_margin: number
  margin_difference: number | null
  winner_points: number
  margin_points: number
  total_points: number
  scored_at: string
}

export type SeasonLeaderboardRow = {
  season: number
  user_id: string
  display_name: string | null
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
  total_points: number
  predictions_made: number
  avg_points_per_prediction: number | null
  exact_margin_count: number
  correct_winner_count: number
  /** Sum of margin_points only (excludes winner_points). */
  margin_points_total: number
  margin_points_average: number | null
}

/** Sort by kickoff_time asc, then created_at asc, then home_team asc. */
export function sortPlayableMatchesForPredictScore(matches: GameMatch[]): GameMatch[] {
  return [...matches].sort((a, b) => {
    const kt = +new Date(a.kickoff_time) - +new Date(b.kickoff_time)
    if (kt !== 0) return kt
    const ct = +new Date(a.created_at) - +new Date(b.created_at)
    if (ct !== 0) return ct
    return a.home_team.localeCompare(b.home_team)
  })
}

export function partitionFeaturedMatches(matches: GameMatch[]): {
  featured: GameMatch[]
  rest: GameMatch[]
} {
  const sorted = sortPlayableMatchesForPredictScore(matches)
  return {
    featured: sorted.filter((m) => !!m.is_featured),
    rest: sorted.filter((m) => !m.is_featured),
  }
}

export type MatchLeaderboardEntry = {
  user_id: string
  rank: number
  display_name: string
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
  first_name: string | null
  total_points: number
  margin_difference: number | null
  winner_correct: boolean
  winner_points: number
  margin_points: number
}

export async function fetchPlayableGameMatches(client: SupabaseClient) {
  const { data, error } = await client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order'
    )
    .in('status', ['upcoming', 'locked'])

  const raw = (data as GameMatch[] | null) ?? []
  return { data: sortPlayableMatchesForPredictScore(raw), error }
}

export async function fetchUserPredictionsForMatches(
  client: SupabaseClient,
  userId: string,
  matchIds: string[]
) {
  if (matchIds.length === 0) {
    return { data: [] as UserPredictionRow[], error: null }
  }

  const { data, error } = await client
    .from('user_predictions')
    .select('id, match_id, user_id, predicted_winner, predicted_margin, submitted_at')
    .eq('user_id', userId)
    .in('match_id', matchIds)

  return { data: (data as UserPredictionRow[] | null) ?? [], error }
}

export async function fetchCompletedGameMatches(client: SupabaseClient, limit = 20) {
  const { data, error } = await client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at'
    )
    .eq('status', 'completed')
    .order('kickoff_time', { ascending: false })
    .limit(limit)

  return { data: (data as GameMatch[] | null) ?? [], error }
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

/** Match leaderboard: total_points desc, margin_difference asc (nulls last). */
export async function fetchMatchLeaderboardWithProfiles(
  client: SupabaseClient,
  matchId: string
) {
  const { data: scores, error } = await client
    .from('user_prediction_scores')
    .select(
      'user_id, total_points, margin_difference, winner_correct, winner_points, margin_points'
    )
    .eq('match_id', matchId)
    .order('total_points', { ascending: false })
    .order('margin_difference', { ascending: true, nullsFirst: false })

  if (error) {
    return { rows: [] as MatchLeaderboardEntry[], error }
  }

  const raw = scores as {
    user_id: string
    total_points: unknown
    margin_difference: unknown
    winner_correct: boolean
    winner_points: unknown
    margin_points: unknown
  }[]

  if (!raw.length) {
    return { rows: [] as MatchLeaderboardEntry[], error: null }
  }

  const ids = [...new Set(raw.map((s) => s.user_id))]
  const { data: profiles, error: pErr } = await client
    .from('user_profiles')
    .select('id, display_name, first_name, avatar_url, avatar_letter, avatar_colour')
    .in('id', ids)

  if (pErr) {
    return { rows: [] as MatchLeaderboardEntry[], error: pErr }
  }

  const pm = new Map(
    (
      profiles as {
        id: string
        display_name: string
        first_name: string | null
        avatar_url: string | null
        avatar_letter: string | null
        avatar_colour: string | null
      }[] | null
    )?.map((p) => [p.id, p]) ?? []
  )

  const rows: MatchLeaderboardEntry[] = raw.map((s, i) => {
    const p = pm.get(s.user_id)
    return {
      user_id: s.user_id,
      rank: i + 1,
      display_name: p?.display_name?.trim() || 'Player',
      avatar_url: p?.avatar_url ?? null,
      avatar_letter: p?.avatar_letter ?? null,
      avatar_colour: p?.avatar_colour ?? null,
      first_name: p?.first_name ?? null,
      total_points: num(s.total_points),
      margin_difference:
        s.margin_difference === null || s.margin_difference === undefined
          ? null
          : num(s.margin_difference),
      winner_correct: s.winner_correct,
      winner_points: num(s.winner_points),
      margin_points: num(s.margin_points),
    }
  })

  return { rows, error: null }
}

export async function fetchSeasonLeaderboard(client: SupabaseClient, season: number) {
  const { data, error } = await client
    .from('predict_score_season_leaderboard')
    .select('*')
    .eq('season', season)

  if (error) {
    return { data: [] as SeasonLeaderboardRow[], error }
  }

  const rows = (data as Record<string, unknown>[] | null) ?? []
  const mapped: SeasonLeaderboardRow[] = rows.map((r) => ({
    season: num(r.season, season),
    user_id: String(r.user_id),
    display_name: r.display_name != null ? String(r.display_name) : null,
    avatar_url: r.avatar_url != null ? String(r.avatar_url) : null,
    avatar_letter: r.avatar_letter != null ? String(r.avatar_letter) : null,
    avatar_colour: r.avatar_colour != null ? String(r.avatar_colour) : null,
    total_points: num(r.total_points),
    predictions_made: num(r.predictions_made),
    avg_points_per_prediction:
      r.avg_points_per_prediction === null || r.avg_points_per_prediction === undefined
        ? null
        : num(r.avg_points_per_prediction),
    exact_margin_count: num(r.exact_margin_count),
    correct_winner_count: num(r.correct_winner_count),
    margin_points_total: num(r.margin_points_total),
    margin_points_average:
      r.margin_points_average === null || r.margin_points_average === undefined
        ? null
        : num(r.margin_points_average),
  }))

  return { data: mapped, error: null }
}

export async function fetchLeaderboardSeasons(client: SupabaseClient) {
  const { data, error } = await client.from('predict_score_season_leaderboard').select('season')

  if (error || !data?.length) {
    return { seasons: [] as number[], error }
  }

  const set = new Set<number>()
  for (const row of data as { season: unknown }[]) {
    set.add(num(row.season))
  }
  return { seasons: [...set].sort((a, b) => b - a), error: null }
}

export async function fetchGameMatchById(client: SupabaseClient, matchId: string) {
  const { data, error } = await client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order'
    )
    .eq('id', matchId)
    .maybeSingle()

  return { match: (data as GameMatch | null) ?? null, error }
}
