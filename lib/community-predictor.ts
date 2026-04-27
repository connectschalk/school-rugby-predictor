import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKETS = ['5', '10', '15', '20+'] as const
export type CommunityMarginBucket = (typeof BUCKETS)[number]

function isBucket(s: string): s is CommunityMarginBucket {
  return (BUCKETS as readonly string[]).includes(s)
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

export type CommunityStatsOk = {
  allowed: true
  reason: null
  match_id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  /** From final scores when both set; else null. */
  actual_winner: 'home' | 'away' | 'draw' | null
  /** abs(home_score - away_score) when both scores set; else null. */
  actual_margin: number | null
  total_predictions: number
  home_prediction_count: number
  away_prediction_count: number
  /** Percent of all picks that chose home (0–100, one decimal from RPC). */
  home_prediction_pct: number
  /** Percent of all picks that chose away (0–100, one decimal from RPC). */
  away_prediction_pct: number
  bucket_rows: CommunityBucketRow[]
  /** e.g. "Paarl Boys by 5", "Draw / even", or null if no picks. */
  community_average_label: string | null
  user_locked_winner: 'home' | 'away' | null
  user_locked_margin: number | null
}

export type CommunityStatsResponse = CommunityStatsDenied | CommunityStatsOk

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
  return {
    allowed: true,
    reason: null,
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
    bucket_rows: parseBucketRows(o.bucket_rows),
    community_average_label: avgRaw != null && String(avgRaw).trim() !== '' ? String(avgRaw) : null,
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
