import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolved settings used by recalculation and predictor (no nulls). */
export type ConsistencyModelSettings = {
  season: number
  error_divisor: number
  min_trust_floor: number
  trusted_anchor_min_matches: number
  trusted_anchor_min_adjusted_consistency: number
  usable_reference_min_matches: number
  usable_reference_min_adjusted_consistency: number
  unstable_min_matches: number
  strong_opponent_step: number
  max_strong_opponent_count: number
}

export type StrongOpponentBoostParams = {
  strongOpponentStep: number
  maxStrongOpponentCount: number
}

export const DEFAULT_CONSISTENCY_MODEL_SETTINGS: Omit<ConsistencyModelSettings, 'season'> = {
  error_divisor: 30,
  min_trust_floor: 0.2,
  trusted_anchor_min_matches: 4,
  trusted_anchor_min_adjusted_consistency: 0.6,
  usable_reference_min_matches: 3,
  usable_reference_min_adjusted_consistency: 0.45,
  unstable_min_matches: 2,
  strong_opponent_step: 0.15,
  max_strong_opponent_count: 2,
}

export function mergeConsistencyModelDefaults(
  season: number,
  row: Partial<Record<keyof Omit<ConsistencyModelSettings, 'season'>, number>> | null
): ConsistencyModelSettings {
  const d = DEFAULT_CONSISTENCY_MODEL_SETTINGS
  const r = row || {}
  return {
    season,
    error_divisor: clampPositive(r.error_divisor ?? d.error_divisor, d.error_divisor),
    min_trust_floor: clampUnit(r.min_trust_floor ?? d.min_trust_floor, d.min_trust_floor),
    trusted_anchor_min_matches: clampIntMin1(
      r.trusted_anchor_min_matches ?? d.trusted_anchor_min_matches,
      d.trusted_anchor_min_matches
    ),
    trusted_anchor_min_adjusted_consistency: clampUnit(
      r.trusted_anchor_min_adjusted_consistency ?? d.trusted_anchor_min_adjusted_consistency,
      d.trusted_anchor_min_adjusted_consistency
    ),
    usable_reference_min_matches: clampIntMin1(
      r.usable_reference_min_matches ?? d.usable_reference_min_matches,
      d.usable_reference_min_matches
    ),
    usable_reference_min_adjusted_consistency: clampUnit(
      r.usable_reference_min_adjusted_consistency ?? d.usable_reference_min_adjusted_consistency,
      d.usable_reference_min_adjusted_consistency
    ),
    unstable_min_matches: clampIntMin1(r.unstable_min_matches ?? d.unstable_min_matches, d.unstable_min_matches),
    strong_opponent_step: clampNonNegative(
      r.strong_opponent_step ?? d.strong_opponent_step,
      d.strong_opponent_step
    ),
    max_strong_opponent_count: clampIntMin0(
      r.max_strong_opponent_count ?? d.max_strong_opponent_count,
      d.max_strong_opponent_count
    ),
  }
}

function clampPositive(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function clampUnit(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function clampNonNegative(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function clampIntMin1(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.floor(n))
}

function clampIntMin0(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

type SettingsRow = {
  season?: number
  error_divisor?: number | null
  min_trust_floor?: number | null
  trusted_anchor_min_matches?: number | null
  trusted_anchor_min_adjusted_consistency?: number | null
  usable_reference_min_matches?: number | null
  usable_reference_min_adjusted_consistency?: number | null
  unstable_min_matches?: number | null
  strong_opponent_step?: number | null
  max_strong_opponent_count?: number | null
}

/**
 * Load consistency model settings for a season. If no row exists, returns defaults.
 */
export async function getConsistencyModelSettings(
  supabase: SupabaseClient,
  season: number
): Promise<ConsistencyModelSettings> {
  const { data, error } = await supabase
    .from('consistency_model_settings')
    .select(
      [
        'season',
        'error_divisor',
        'min_trust_floor',
        'trusted_anchor_min_matches',
        'trusted_anchor_min_adjusted_consistency',
        'usable_reference_min_matches',
        'usable_reference_min_adjusted_consistency',
        'unstable_min_matches',
        'strong_opponent_step',
        'max_strong_opponent_count',
      ].join(', ')
    )
    .eq('season', season)
    .maybeSingle()

  if (error) {
    return mergeConsistencyModelDefaults(season, null)
  }

  const row = data as SettingsRow | null
  if (!row) {
    return mergeConsistencyModelDefaults(season, null)
  }

  return mergeConsistencyModelDefaults(season, {
    error_divisor: row.error_divisor ?? undefined,
    min_trust_floor: row.min_trust_floor ?? undefined,
    trusted_anchor_min_matches: row.trusted_anchor_min_matches ?? undefined,
    trusted_anchor_min_adjusted_consistency: row.trusted_anchor_min_adjusted_consistency ?? undefined,
    usable_reference_min_matches: row.usable_reference_min_matches ?? undefined,
    usable_reference_min_adjusted_consistency: row.usable_reference_min_adjusted_consistency ?? undefined,
    unstable_min_matches: row.unstable_min_matches ?? undefined,
    strong_opponent_step: row.strong_opponent_step ?? undefined,
    max_strong_opponent_count: row.max_strong_opponent_count ?? undefined,
  })
}

export function toStrongOpponentBoostParams(settings: ConsistencyModelSettings): StrongOpponentBoostParams {
  return {
    strongOpponentStep: settings.strong_opponent_step,
    maxStrongOpponentCount: settings.max_strong_opponent_count,
  }
}

/** Default strong-opponent boost (matches DEFAULT_CONSISTENCY_MODEL_SETTINGS). */
export const DEFAULT_STRONG_OPPONENT_BOOST_PARAMS: StrongOpponentBoostParams =
  toStrongOpponentBoostParams(mergeConsistencyModelDefaults(0, null))
