import type { SupabaseClient } from '@supabase/supabase-js'
import {
  predictFixtureMarginTeamAPerspective,
  PREDICTOR_MODEL_VERSION,
  type Match as PredictorMatch,
  type TeamConsistencyRow,
} from '@/lib/prediction-model'
import { getConsistencyModelSettings, toStrongOpponentBoostParams } from '@/lib/consistency-model-settings'
import { recalculateTeamConsistencyFromPredictionHistory } from '@/lib/team-consistency'

export type BackfillMatchRow = {
  id: number
  season: number
  match_date: string
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
}

type Team = { id: number; name: string }

/**
 * Prior = matches strictly before `current.match_date` (same calendar day excluded; no kickoff time in schema).
 */
export function getPriorMatchesForBackfill(
  sortedAsc: BackfillMatchRow[],
  current: BackfillMatchRow
): PredictorMatch[] {
  return sortedAsc
    .filter((m) => m.match_date < current.match_date)
    .map((m) => ({
      id: m.id,
      season: m.season,
      match_date: m.match_date,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      team_a_score: m.team_a_score,
      team_b_score: m.team_b_score,
    }))
}

function sortMatchesForBackfill(rows: BackfillMatchRow[]): BackfillMatchRow[] {
  return [...rows].sort((a, b) => {
    if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1
    return a.id - b.id
  })
}

export type BackfillResult =
  | {
      ok: true
      processed: number
      inserted: number
      skipped: number
      noPrediction: number
      replaced: number
    }
  | { ok: false; error: string }

/**
 * Backfill prediction_history for all matches in a season using only strictly earlier match dates as "known" results.
 * Uses an empty team_consistency map so trust weights do not use future Supabase consistency (volatility fallback only).
 */
export async function backfillPredictionHistoryForSeason(
  supabase: SupabaseClient,
  params: {
    season: number
    teams: Team[]
    replaceExisting?: boolean
  }
): Promise<BackfillResult> {
  const { season, teams, replaceExisting = false } = params

  const { data: raw, error: fetchError } = await supabase
    .from('matches')
    .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
    .eq('season', season)

  if (fetchError) {
    return { ok: false, error: fetchError.message }
  }

  const allMatches = (raw || []) as BackfillMatchRow[]
  const sorted = sortMatchesForBackfill(allMatches)

  const consistencySettings = await getConsistencyModelSettings(supabase, season)
  const strongOpponentBoostParams = toStrongOpponentBoostParams(consistencySettings)

  const emptyConsistency = new Map<number, TeamConsistencyRow>()

  const { data: existingRows, error: existingError } = await supabase
    .from('prediction_history')
    .select('match_id')
    .eq('season', season)
    .not('match_id', 'is', null)

  if (existingError) {
    return { ok: false, error: existingError.message }
  }

  const existingMatchIds = new Set<number>()
  for (const r of existingRows || []) {
    const mid = (r as { match_id: number | null }).match_id
    if (mid != null) existingMatchIds.add(mid)
  }

  let inserted = 0
  let skipped = 0
  let noPrediction = 0
  let replaced = 0

  for (const match of sorted) {
    const priorMatches = getPriorMatchesForBackfill(sorted, match)

    const pre = predictFixtureMarginTeamAPerspective(
      match.team_a_id,
      match.team_b_id,
      priorMatches,
      teams,
      emptyConsistency,
      strongOpponentBoostParams
    )

    const sa = Number(match.team_a_score)
    const sb = Number(match.team_b_score)
    const actual_margin = sa - sb
    const prediction_error =
      pre.predictedMargin != null && Number.isFinite(actual_margin)
        ? Math.abs(pre.predictedMargin - actual_margin)
        : null

    const hasExisting = existingMatchIds.has(match.id)

    if (hasExisting && !replaceExisting) {
      skipped += 1
      continue
    }

    if (pre.predictedMargin == null) {
      noPrediction += 1
    }

    if (hasExisting && replaceExisting) {
      const { error: delErr } = await supabase.from('prediction_history').delete().eq('match_id', match.id)
      if (delErr) {
        return { ok: false, error: `Delete existing history for match ${match.id}: ${delErr.message}` }
      }
      existingMatchIds.delete(match.id)
      replaced += 1
    }

    const { error: insErr } = await supabase.from('prediction_history').insert({
      season,
      match_date: match.match_date,
      match_id: match.id,
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      predicted_margin: pre.predictedMargin,
      actual_margin,
      prediction_error,
      prediction_type: pre.predictionType,
      confidence: pre.confidence,
      model_version: PREDICTOR_MODEL_VERSION,
      was_pre_match_prediction: true,
    })

    if (insErr) {
      return { ok: false, error: `Insert match ${match.id}: ${insErr.message}` }
    }

    existingMatchIds.add(match.id)
    inserted += 1
  }

  await recalculateTeamConsistencyFromPredictionHistory(supabase, season, teams)

  return {
    ok: true,
    processed: sorted.length,
    inserted,
    skipped,
    noPrediction,
    replaced,
  }
}

/**
 * Remove all prediction_history rows for a season (e.g. before a clean backfill).
 */
export async function clearPredictionHistoryForSeason(
  supabase: SupabaseClient,
  season: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('prediction_history').delete().eq('season', season)

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
