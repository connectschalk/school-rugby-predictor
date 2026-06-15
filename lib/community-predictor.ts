import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionScoringMode } from '@/lib/competitions'

const BUCKETS = ['5', '10', '15', '20+'] as const
export type CommunityMarginBucket = (typeof BUCKETS)[number]

function isBucket(s: string): s is CommunityMarginBucket {
  return (BUCKETS as readonly string[]).includes(s)
}

/** Map winning margin (points) to community fixed bucket (same buckets as RPC / pool picks). */
export function marginToCommunityBucket(margin: number): CommunityMarginBucket {
  const m = Math.max(0, Math.trunc(margin))
  if (m <= 5) return '5'
  if (m <= 10) return '10'
  if (m <= 15) return '15'
  return '20+'
}

export type WinnerMarginPick = { side: 'home' | 'away'; margin: number }

export type CommunityMatchSlice = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
}

function parseActualWinnerFromScores(
  homeScore: number | null,
  awayScore: number | null
): 'home' | 'away' | 'draw' | null {
  if (homeScore == null || awayScore == null) return null
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return 'draw'
}

/** Signed community average label from home/away winner+margins (pool / one-match). */
export function communityAverageLabelFromSignedPicks(
  homeTeam: string,
  awayTeam: string,
  margins: WinnerMarginPick[]
): string | null {
  if (!margins.length) return null
  let signedSum = 0
  for (const x of margins) {
    signedSum += x.side === 'home' ? -x.margin : x.margin
  }
  const avg = signedSum / margins.length
  if (Math.abs(avg) < 0.25) return 'Draw / even'
  if (avg < 0) return `${homeTeam} by ${Math.round(Math.abs(avg))}`
  return `${awayTeam} by ${Math.round(avg)}`
}

/**
 * Build {@link CommunityStatsOk} from arbitrary winner+margins (pool revealed picks, one-match locked picks).
 * Single aggregation path for margin buckets and percentages.
 */
export function buildCommunityStatsOkFromMarginPicks(
  match: CommunityMatchSlice,
  picks: WinnerMarginPick[],
  options?: {
    viewerPick?: WinnerMarginPick | null
  }
): CommunityStatsOkRugby {
  const hs = match.home_score
  const ascr = match.away_score
  const completed = match.status === 'completed'
  const actualWinner = completed ? parseActualWinnerFromScores(hs, ascr) : null
  const actualMargin =
    completed && hs != null && ascr != null ? Math.abs(Math.trunc(hs - ascr)) : null

  const normalized = picks
    .map((p) => ({
      side: p.side,
      margin: Math.max(0, Math.trunc(Number(p.margin))),
    }))
    .filter((p) => (p.side === 'home' || p.side === 'away') && Number.isFinite(p.margin))

  const total = normalized.length
  let homeC = 0
  let awayC = 0
  const bucketTally = new Map<string, number>()
  for (const p of normalized) {
    if (p.side === 'home') homeC += 1
    else awayC += 1
    const b = marginToCommunityBucket(p.margin)
    const key = `${p.side}:${b}`
    bucketTally.set(key, (bucketTally.get(key) ?? 0) + 1)
  }

  const bucket_rows: CommunityBucketRow[] = []
  for (const side of ['home', 'away'] as const) {
    for (const bucket of BUCKETS) {
      const c = bucketTally.get(`${side}:${bucket}`) ?? 0
      const pct = total > 0 ? Math.round((c / total) * 1000) / 10 : 0
      bucket_rows.push({
        side,
        bucket,
        percentage: pct,
        team_name: side === 'home' ? match.home_team : match.away_team,
      })
    }
  }

  let homePct = total > 0 ? Math.round((homeC / total) * 1000) / 10 : 0
  let awayPct = total > 0 ? Math.round((awayC / total) * 1000) / 10 : 0
  if (total === 0) {
    homePct = 0
    awayPct = 0
  }

  const vp = options?.viewerPick
  const uw = vp?.side === 'away' ? 'away' : vp?.side === 'home' ? 'home' : null
  const um =
    uw === 'home' || uw === 'away' ? Math.max(0, Math.trunc(Number(vp!.margin))) : null

  return {
    allowed: true,
    reason: null,
    scoring_mode: 'rugby_margin',
    match_id: match.id,
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_time: match.kickoff_time,
    status: match.status,
    home_score: hs,
    away_score: ascr,
    actual_winner: actualWinner,
    actual_margin: actualMargin,
    total_predictions: total,
    home_prediction_count: homeC,
    away_prediction_count: awayC,
    home_prediction_pct: homePct,
    away_prediction_pct: awayPct,
    bucket_rows,
    community_average_label: communityAverageLabelFromSignedPicks(match.home_team, match.away_team, normalized),
    user_locked_winner: uw,
    user_locked_margin: um,
  }
}

/** One margin bucket tally (aggregated from user_predictions only). */
export type CommunityBucketRow = {
  side: 'home' | 'away'
  bucket: CommunityMarginBucket
  /** Share of all predictions for this match (0–100). */
  percentage: number
  team_name: string
}

export type CommunityStatsDenied = {
  allowed: false
  reason: 'not_authenticated' | 'match_not_found' | 'lock_required' | string
  match_id?: string
  home_team?: string
  away_team?: string
  kickoff_time?: string
  status?: string
}

export type CommunityScorelineRow = {
  home_score: number
  away_score: number
  count: number
  percentage: number
  label: string
}

export type CommunityStatsBase = {
  allowed: true
  reason: null
  scoring_mode: CompetitionScoringMode
  match_id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  actual_winner: 'home' | 'away' | 'draw' | null
  actual_margin: number | null
  total_predictions: number
  home_prediction_count: number
  away_prediction_count: number
  home_prediction_pct: number
  away_prediction_pct: number
  community_average_label: string | null
}

export type CommunityStatsOkRugby = CommunityStatsBase & {
  scoring_mode: 'rugby_margin'
  bucket_rows: CommunityBucketRow[]
  user_locked_winner: 'home' | 'away' | null
  user_locked_margin: number | null
}

export type CommunityStatsOkSoccer = CommunityStatsBase & {
  scoring_mode: 'soccer_exact_score'
  draw_prediction_count: number
  draw_prediction_pct: number
  top_scorelines: CommunityScorelineRow[]
  user_locked_home_score: number | null
  user_locked_away_score: number | null
}

export type CommunityStatsOk = CommunityStatsOkRugby | CommunityStatsOkSoccer

export type CommunityStatsResponse = CommunityStatsDenied | CommunityStatsOk

/** Kickoff display for Community Picks (SAST). */
export const COMMUNITY_PICKS_TIMEZONE = 'Africa/Johannesburg'

/**
 * e.g. completed → "Sat 18 Apr 2026 · Final"
 * e.g. upcoming/locked → "Sat 2 May 2026 · 11:00" (24h local SAST)
 */
export function formatCommunityMatchScheduleLine(kickoffIso: string, status: string): string {
  const d = new Date(kickoffIso)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: COMMUNITY_PICKS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
  const st = status.trim().toLowerCase()
  if (st === 'completed') {
    return `${datePart} · Final`
  }
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: COMMUNITY_PICKS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${datePart} · ${timePart}`
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function parseNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }
  return null
}

function parseActualWinner(v: unknown): 'home' | 'away' | 'draw' | null {
  if (v === 'home' || v === 'away' || v === 'draw') return v
  return null
}

function parseBucketRows(raw: unknown): CommunityBucketRow[] {
  if (!Array.isArray(raw)) return []
  const out: CommunityBucketRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const side = o.side === 'away' ? 'away' : 'home'
    const b = String(o.bucket ?? '')
    if (!isBucket(b)) continue
    out.push({
      side,
      bucket: b,
      percentage: num(o.percentage),
      team_name: String(o.team_name ?? ''),
    })
  }
  return out
}

function parseScorelineRows(raw: unknown): CommunityScorelineRow[] {
  if (!Array.isArray(raw)) return []
  const out: CommunityScorelineRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const home = parseNullableInt(o.home_score)
    const away = parseNullableInt(o.away_score)
    if (home == null || away == null) continue
    out.push({
      home_score: home,
      away_score: away,
      count: num(o.count),
      percentage: num(o.percentage),
      label: String(o.label ?? `${home}-${away}`),
    })
  }
  return out
}

function parseScoringMode(v: unknown): CompetitionScoringMode {
  return v === 'soccer_exact_score' ? 'soccer_exact_score' : 'rugby_margin'
}

export function parseCommunityStatsRpc(data: unknown): CommunityStatsResponse {
  if (!data || typeof data !== 'object') {
    return { allowed: false, reason: 'match_not_found' }
  }
  const o = data as Record<string, unknown>
  if (o.allowed === false) {
    return {
      allowed: false,
      reason: String(o.reason ?? 'unknown'),
      match_id: o.match_id != null ? String(o.match_id) : undefined,
      home_team: o.home_team != null ? String(o.home_team) : undefined,
      away_team: o.away_team != null ? String(o.away_team) : undefined,
      kickoff_time: o.kickoff_time != null ? String(o.kickoff_time) : undefined,
      status: o.status != null ? String(o.status) : undefined,
    }
  }
  const total = num(o.total_predictions)
  const homeC = num(o.home_prediction_count)
  const awayC = num(o.away_prediction_count)
  let homePct = num(o.home_prediction_pct, NaN)
  let awayPct = num(o.away_prediction_pct, NaN)
  if (!Number.isFinite(homePct) && total > 0) {
    homePct = Math.round((homeC / total) * 1000) / 10
  }
  if (!Number.isFinite(awayPct) && total > 0) {
    awayPct = Math.round((awayC / total) * 1000) / 10
  }
  if (!Number.isFinite(homePct)) homePct = 0
  if (!Number.isFinite(awayPct)) awayPct = 0

  const avgRaw = o.community_average_label
  const hs = parseNullableInt(o.home_score)
  const ascr = parseNullableInt(o.away_score)
  const scoringMode = parseScoringMode(o.scoring_mode)

  const base = {
    allowed: true as const,
    reason: null,
    scoring_mode: scoringMode,
    match_id: String(o.match_id ?? ''),
    home_team: String(o.home_team ?? ''),
    away_team: String(o.away_team ?? ''),
    kickoff_time: String(o.kickoff_time ?? ''),
    status: String(o.status ?? ''),
    home_score: hs,
    away_score: ascr,
    actual_winner: parseActualWinner(o.actual_winner),
    actual_margin: o.actual_margin === null || o.actual_margin === undefined ? null : parseNullableInt(o.actual_margin),
    total_predictions: total,
    home_prediction_count: homeC,
    away_prediction_count: awayC,
    home_prediction_pct: homePct,
    away_prediction_pct: awayPct,
    community_average_label: avgRaw != null && String(avgRaw).trim() !== '' ? String(avgRaw) : null,
  }

  if (scoringMode === 'soccer_exact_score') {
    return {
      ...base,
      scoring_mode: 'soccer_exact_score',
      draw_prediction_count: num(o.draw_prediction_count),
      draw_prediction_pct: num(o.draw_prediction_pct),
      top_scorelines: parseScorelineRows(o.top_scorelines),
      user_locked_home_score: parseNullableInt(o.user_locked_home_score),
      user_locked_away_score: parseNullableInt(o.user_locked_away_score),
    }
  }

  return {
    ...base,
    scoring_mode: 'rugby_margin',
    bucket_rows: parseBucketRows(o.bucket_rows),
    user_locked_winner: o.user_locked_winner === 'away' ? 'away' : o.user_locked_winner === 'home' ? 'home' : null,
    user_locked_margin:
      o.user_locked_margin === null || o.user_locked_margin === undefined ? null : num(o.user_locked_margin),
  }
}

export async function fetchCommunityPredictionStats(
  client: SupabaseClient,
  matchId: string
): Promise<{ data: CommunityStatsResponse; error: Error | null }> {
  const { data, error } = await client.rpc('get_community_prediction_stats', { p_match_id: matchId })
  if (error) {
    return { data: { allowed: false, reason: error.message }, error: new Error(error.message) }
  }
  return { data: parseCommunityStatsRpc(data), error: null }
}
