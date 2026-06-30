import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getCompetitionBySlug,
  resolveCompetitionScoringMode,
  SCHOOLS_COMPETITION_SLUG,
  type CompetitionScoringMode,
} from '@/lib/competitions'

export type GameMatchStatus = 'upcoming' | 'locked' | 'completed' | 'cancelled'

export type GameMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: GameMatchStatus
  home_score: number | null
  away_score: number | null
  penalty_winner?: 'home' | 'away' | null
  fixture_round?: string | null
  created_at: string
  /** Highlight ordering on Predict a Score (max 10 live upcoming/locked). */
  is_featured?: boolean
  featured_order?: number | null
  province_group?: string | null
  league_group?: string | null
  tournament?: string | null
  /** Team-level province labels (sheet); separate from match `province_group`. */
  home_team_province?: string | null
  away_team_province?: string | null
  is_interprovincial?: boolean
  has_wp_elite_team?: boolean
  is_prestige_match?: boolean | null
  is_prestige?: boolean
  verification_status?: 'draft' | 'needs_review' | 'verified' | 'rejected' | null
  prediction_cutoff_time?: string | null
}

export type UserPredictionRow = {
  id: string
  match_id: string
  user_id: string
  predicted_winner: 'home' | 'away' | 'draw' | null
  predicted_margin: number | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  predicted_penalty_winner?: 'home' | 'away' | null
  submitted_at: string
  is_locked?: boolean
  locked_at?: string | null
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
  exact_score_count: number
  correct_result_count: number
  cumulative_margin_error: number
  average_margin_error: number | null
  /** Legacy compatibility fields. */
  margin_points_total: number
  margin_points_average: number | null
}

/** Supabase view for per-competition season rankings (migration 077 / 081). */
export const PREDICT_SCORE_COMPETITION_LEADERBOARD_VIEW = 'predict_score_competition_leaderboard'

/** Shown when the competition leaderboard view has not been deployed yet. */
export const COMPETITION_LEADERBOARD_VIEW_MISSING_MESSAGE =
  'Competition leaderboard is not available yet. Apply Supabase migrations 075 through 081 (including predict_score_competition_leaderboard), then refresh the schema cache in the Supabase dashboard if needed.'

export function isCompetitionLeaderboardViewMissingError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (!msg.includes('predict_score_competition_leaderboard')) return false
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find') ||
    msg.includes('does not exist') ||
    msg.includes('pgrst205') ||
    msg.includes('relation') && msg.includes('not exist')
  )
}

export type CompetitionLeaderboardFetchResult = {
  data: SeasonLeaderboardRow[]
  error: Error | null
  viewMissing: boolean
}

export type CompetitionLeaderboardSeasonsResult = {
  seasons: number[]
  error: Error | null
  viewMissing: boolean
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
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order, verification_status'
    )
    .eq('status', 'upcoming')
    .eq('verification_status', 'verified')

  const raw = (data as GameMatch[] | null) ?? []
  return { data: sortPlayableMatchesForPredictScore(raw), error }
}

const PREDICT_SCORE_MATCH_SELECT =
  'id, home_team, away_team, kickoff_time, status, home_score, away_score, penalty_winner, fixture_round, created_at, home_team_province, away_team_province, prediction_cutoff_time, verification_status'

/** Predict Score hub: upcoming only, kickoff order, provinces for grouping (no pool / group filters). */
export async function fetchUpcomingPredictScoreMatches(
  client: SupabaseClient,
  competitionId?: string
) {
  let query = client
    .from('game_matches')
    .select(PREDICT_SCORE_MATCH_SELECT)
    .eq('status', 'upcoming')
    .order('kickoff_time', { ascending: true })

  if (competitionId) {
    query = query.eq('competition_id', competitionId)
  }

  const { data, error } = await query
  return { data: (data as GameMatch[] | null) ?? [], error }
}

/** Upcoming fixtures for a single competition (predict page). */
export async function fetchCompetitionUpcomingMatches(client: SupabaseClient, competitionId: string) {
  return fetchUpcomingPredictScoreMatches(client, competitionId)
}

/** Read-only fixture list for a competition (upcoming, locked, completed). */
export async function fetchCompetitionFixtures(client: SupabaseClient, competitionId: string, limit = 500) {
  const { data, error } = await client
    .from('game_matches')
    .select(PREDICT_SCORE_MATCH_SELECT)
    .eq('competition_id', competitionId)
    .in('status', ['upcoming', 'locked', 'completed'])
    .order('kickoff_time', { ascending: true })
    .limit(limit)

  return { data: (data as GameMatch[] | null) ?? [], error }
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
    .select(
      'id, match_id, user_id, predicted_winner, predicted_margin, predicted_home_score, predicted_away_score, predicted_penalty_winner, submitted_at, is_locked, locked_at'
    )
    .eq('user_id', userId)
    .in('match_id', matchIds)

  return { data: (data as UserPredictionRow[] | null) ?? [], error }
}

/** All public fixtures for community hub (upcoming, locked, completed). */
export async function fetchGameMatchesForCommunityHub(
  client: SupabaseClient,
  limit = 200,
  competitionId?: string
) {
  let query = client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, is_featured, featured_order, home_team_province, away_team_province, prediction_cutoff_time'
    )
    .in('status', ['upcoming', 'locked', 'completed'])
    .order('kickoff_time', { ascending: false })
    .limit(limit)

  if (competitionId) {
    query = query.eq('competition_id', competitionId)
  }

  const { data, error } = await query
  return { data: (data as GameMatch[] | null) ?? [], error }
}

/**
 * Chronological window of matches with province / league fields for pool creation preview.
 * Ordered ascending by kickoff so future fixtures are not truncated when limiting.
 */
export async function fetchGameMatchesForPoolPreview(
  client: SupabaseClient,
  limit = 1200,
  competitionId?: string
) {
  const since = new Date()
  since.setDate(since.getDate() - 2)
  let query = client
    .from('game_matches')
    .select(
      'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, home_team_province, away_team_province, province_group, league_group, is_prestige_match, is_prestige, is_interprovincial, is_featured, featured_order'
    )
    .in('status', ['upcoming', 'locked', 'completed'])
    .gte('kickoff_time', since.toISOString())
    .order('kickoff_time', { ascending: true })
    .limit(limit)

  if (competitionId) {
    query = query.eq('competition_id', competitionId)
  }

  const { data, error } = await query
  return { data: (data as GameMatch[] | null) ?? [], error }
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
    exact_score_count: num(r.exact_score_count ?? 0),
    correct_result_count: num(r.correct_result_count ?? r.correct_winner_count),
    cumulative_margin_error: num(r.cumulative_margin_error),
    average_margin_error:
      r.average_margin_error === null || r.average_margin_error === undefined
        ? null
        : num(r.average_margin_error),
    margin_points_total: num(r.margin_points_total),
    margin_points_average:
      r.margin_points_average === null || r.margin_points_average === undefined
        ? null
        : num(r.margin_points_average),
  }))

  return { data: mapped, error: null }
}

/**
 * Per-user average margin error over their most recent `recentCount` scored games in `season`
 * (by match kickoff). Used for “delta vs recent form” on season leaderboards.
 */
export async function fetchSeasonRecentMarginAverages(
  client: SupabaseClient,
  season: number,
  recentCount = 5,
  competitionId?: string
): Promise<{ data: Record<string, number | null>; error: Error | null }> {
  let matchQuery = client.from('game_matches').select('id, kickoff_time').eq('status', 'completed')
  if (competitionId) {
    matchQuery = matchQuery.eq('competition_id', competitionId)
  }
  const { data: matches, error: mErr } = await matchQuery

  if (mErr) {
    return { data: {}, error: mErr }
  }

  const raw = (matches as { id: string; kickoff_time: string }[] | null) ?? []
  const seasonMatchIds = raw
    .filter((m) => new Date(m.kickoff_time).getFullYear() === season)
    .map((m) => m.id)

  const seasonIdSet = new Set(seasonMatchIds)
  const kickByMatch = new Map<string, number>()
  for (const m of raw) {
    if (seasonIdSet.has(m.id)) {
      kickByMatch.set(m.id, new Date(m.kickoff_time).getTime())
    }
  }

  if (seasonMatchIds.length === 0) {
    return { data: {}, error: null }
  }

  const CHUNK = 150
  type ScoreRow = { user_id: string; margin_difference: number | null; match_id: string }
  const allScores: ScoreRow[] = []
  for (let i = 0; i < seasonMatchIds.length; i += CHUNK) {
    const chunk = seasonMatchIds.slice(i, i + CHUNK)
    const { data: scores, error: sErr } = await client
      .from('user_prediction_scores')
      .select('user_id, margin_difference, match_id')
      .in('match_id', chunk)
      .not('margin_difference', 'is', null)

    if (sErr) {
      return { data: {}, error: sErr }
    }
    allScores.push(...((scores as ScoreRow[] | null) ?? []))
  }

  const byUser = new Map<string, { md: number; t: number }[]>()
  for (const s of allScores) {
    const t = kickByMatch.get(s.match_id)
    if (t === undefined || s.margin_difference == null) continue
    const arr = byUser.get(s.user_id) ?? []
    arr.push({ md: num(s.margin_difference), t })
    byUser.set(s.user_id, arr)
  }

  const out: Record<string, number | null> = {}
  for (const [uid, arr] of byUser) {
    arr.sort((a, b) => b.t - a.t)
    const slice = arr.slice(0, recentCount)
    if (slice.length === 0) {
      out[uid] = null
      continue
    }
    const avg = slice.reduce((sum, x) => sum + x.md, 0) / slice.length
    out[uid] = avg
  }

  return { data: out, error: null }
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

export async function fetchCompetitionLeaderboard(
  client: SupabaseClient,
  competitionId: string,
  season: number
): Promise<CompetitionLeaderboardFetchResult> {
  const { data, error } = await client
    .from(PREDICT_SCORE_COMPETITION_LEADERBOARD_VIEW)
    .select('*')
    .eq('competition_id', competitionId)
    .eq('season', season)

  if (error) {
    const viewMissing = isCompetitionLeaderboardViewMissingError(error)
    return { data: [] as SeasonLeaderboardRow[], error, viewMissing }
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
    exact_score_count: num(r.exact_score_count ?? 0),
    correct_result_count: num(r.correct_result_count ?? r.correct_winner_count),
    cumulative_margin_error: num(r.cumulative_margin_error),
    average_margin_error:
      r.average_margin_error === null || r.average_margin_error === undefined
        ? null
        : num(r.average_margin_error),
    margin_points_total: num(r.margin_points_total),
    margin_points_average:
      r.margin_points_average === null || r.margin_points_average === undefined
        ? null
        : num(r.margin_points_average),
  }))

  return { data: mapped, error: null, viewMissing: false }
}

export async function fetchCompetitionLeaderboardSeasons(
  client: SupabaseClient,
  competitionId: string
): Promise<CompetitionLeaderboardSeasonsResult> {
  const { data, error } = await client
    .from(PREDICT_SCORE_COMPETITION_LEADERBOARD_VIEW)
    .select('season')
    .eq('competition_id', competitionId)

  if (error) {
    const viewMissing = isCompetitionLeaderboardViewMissingError(error)
    return { seasons: [] as number[], error, viewMissing }
  }

  if (!data?.length) {
    return { seasons: [] as number[], error: null, viewMissing: false }
  }

  const set = new Set<number>()
  for (const row of data as { season: unknown }[]) {
    set.add(num(row.season))
  }
  return { seasons: [...set].sort((a, b) => b - a), error: null, viewMissing: false }
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

export type MyPredictionMatch = GameMatch & {
  competition_id: string | null
}

export type MyPredictionCompetitionMeta = {
  id: string
  slug: string
  name: string
  scoring_mode: CompetitionScoringMode
}

/** One row per user prediction with joined match and optional score row (Predict hub / My Predictions). */
export type MyPredictionOverviewRow = {
  prediction: UserPredictionRow
  match: MyPredictionMatch
  competition: MyPredictionCompetitionMeta | null
  score: UserPredictionScoreRow | null
}

export type FetchMyPredictionsOptions = {
  competitionId?: string
  competitionSlug?: string
}

function matchBelongsToCompetitionFilter(
  matchCompetitionId: string | null | undefined,
  filter: { competitionId: string; slug: string }
): boolean {
  if (filter.slug === SCHOOLS_COMPETITION_SLUG) {
    return matchCompetitionId == null || matchCompetitionId === filter.competitionId
  }
  return matchCompetitionId === filter.competitionId
}

const MY_PREDICTIONS_MATCH_SELECT =
  'id, home_team, away_team, kickoff_time, status, home_score, away_score, created_at, competition_id'

/**
 * All predictions for a user with `game_matches`, `competitions`, and `user_prediction_scores`.
 * Optionally filters to one competition (`game_matches.competition_id`; Schools also includes null).
 */
export async function fetchMyPredictionsOverview(
  client: SupabaseClient,
  userId: string,
  options?: FetchMyPredictionsOptions
) {
  const { data: preds, error: pe } = await client
    .from('user_predictions')
    .select(
      'id, match_id, user_id, predicted_winner, predicted_margin, predicted_home_score, predicted_away_score, predicted_penalty_winner, submitted_at, is_locked, locked_at'
    )
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })

  if (pe) {
    return { rows: [] as MyPredictionOverviewRow[], error: pe }
  }

  const list = (preds as UserPredictionRow[] | null) ?? []
  if (list.length === 0) {
    return { rows: [] as MyPredictionOverviewRow[], error: null }
  }

  const matchIds = [...new Set(list.map((p) => p.match_id))]
  const { data: matches, error: me } = await client
    .from('game_matches')
    .select(MY_PREDICTIONS_MATCH_SELECT)
    .in('id', matchIds)

  if (me) {
    return { rows: [] as MyPredictionOverviewRow[], error: me }
  }

  const matchRows = (matches as MyPredictionMatch[] | null) ?? []
  const matchMap = new Map(matchRows.map((m) => [m.id, m]))

  const competitionIds = [
    ...new Set(matchRows.map((m) => m.competition_id).filter((id): id is string => Boolean(id))),
  ]

  let schoolsCompetition: MyPredictionCompetitionMeta | null = null
  const needsSchoolsFallback =
    !options?.competitionId ||
    options.competitionSlug === SCHOOLS_COMPETITION_SLUG ||
    matchRows.some((m) => m.competition_id == null)

  if (needsSchoolsFallback) {
    const { competition } = await getCompetitionBySlug(client, SCHOOLS_COMPETITION_SLUG)
    if (competition) {
      schoolsCompetition = {
        id: competition.id,
        slug: competition.slug,
        name: competition.name,
        scoring_mode: competition.scoring_mode,
      }
      if (!competitionIds.includes(competition.id)) {
        competitionIds.push(competition.id)
      }
    }
  }

  const competitionById = new Map<string, MyPredictionCompetitionMeta>()
  if (schoolsCompetition) {
    competitionById.set(schoolsCompetition.id, schoolsCompetition)
  }

  if (competitionIds.length > 0) {
    const { data: comps, error: ce } = await client
      .from('competitions')
      .select('id, slug, name, scoring_mode')
      .in('id', competitionIds)

    if (ce) {
      return { rows: [] as MyPredictionOverviewRow[], error: ce }
    }

    for (const raw of comps ?? []) {
      const row = raw as Record<string, unknown>
      if (!row.id || !row.slug || !row.name) continue
      competitionById.set(String(row.id), {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        scoring_mode: resolveCompetitionScoringMode(String(row.slug), row.scoring_mode),
      })
    }
  }

  const { data: scores, error: se } = await client
    .from('user_prediction_scores')
    .select(
      'id, prediction_id, match_id, user_id, winner_correct, actual_winner, actual_margin, margin_difference, winner_points, margin_points, total_points, scored_at'
    )
    .eq('user_id', userId)
    .in('match_id', matchIds)

  if (se) {
    return { rows: [] as MyPredictionOverviewRow[], error: se }
  }

  const scoreByPredictionId = new Map(
    ((scores as UserPredictionScoreRow[] | null) ?? []).map((s) => [s.prediction_id, s])
  )

  const filter =
    options?.competitionId && options.competitionSlug
      ? { competitionId: options.competitionId, slug: options.competitionSlug }
      : null

  const rows: MyPredictionOverviewRow[] = []
  for (const prediction of list) {
    const match = matchMap.get(prediction.match_id)
    if (!match) continue
    if (filter && !matchBelongsToCompetitionFilter(match.competition_id, filter)) continue

    const competition =
      (match.competition_id ? competitionById.get(match.competition_id) : null) ??
      schoolsCompetition

    rows.push({
      prediction,
      match,
      competition,
      score: scoreByPredictionId.get(prediction.id) ?? null,
    })
  }

  return { rows, error: null }
}
