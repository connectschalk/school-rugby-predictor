import type { SupabaseClient } from '@supabase/supabase-js'
import {
  predictFixtureMarginTeamAPerspective,
  PREDICTOR_MODEL_VERSION,
  type Match as PredictorMatch,
  type TeamConsistencyRow,
} from '@/lib/prediction-model'
import { getConsistencyModelSettings, toStrongOpponentBoostParams } from '@/lib/consistency-model-settings'
import { recalculateTeamConsistencyFromPredictionHistory } from '@/lib/team-consistency'

type Team = { id: number; name: string }

/**
 * Records a new match result: snapshot model prediction from data before this fixture exists,
 * then inserts the match and a complete prediction_history row (no UPDATE — avoids RLS/update issues).
 */
export async function recordMatchResultWithPrediction(
  supabase: SupabaseClient,
  params: {
    match_date: string
    season: number
    team_a_id: number
    team_b_id: number
    team_a_score: number
    team_b_score: number
    teams: Team[]
  }
): Promise<
  | { ok: true; matchId: number; predictionHistoryId: number }
  | { ok: false; error: string; stage?: string }
> {
  const { match_date, season, team_a_id, team_b_id, team_a_score, team_b_score, teams } = params

  const [
    { data: seasonMatches, error: seasonMatchesError },
    { data: consistencyData, error: consistencyError },
    consistencySettings,
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('id, season, match_date, team_a_id, team_b_id, team_a_score, team_b_score')
      .eq('season', season),
    supabase
      .from('team_consistency')
      .select('team_id, adjusted_consistency, consistency_score, is_anchor, anchor_status')
      .eq('season', season),
    getConsistencyModelSettings(supabase, season),
  ])

  if (seasonMatchesError) {
    return { ok: false, error: seasonMatchesError.message, stage: 'load_matches' }
  }
  if (consistencyError) {
    return { ok: false, error: consistencyError.message, stage: 'load_consistency' }
  }

  const consistencyMap = new Map<number, TeamConsistencyRow>()
  for (const row of (consistencyData || []) as TeamConsistencyRow[]) {
    consistencyMap.set(row.team_id, row)
  }

  const pre = predictFixtureMarginTeamAPerspective(
    team_a_id,
    team_b_id,
    (seasonMatches || []) as PredictorMatch[],
    teams,
    consistencyMap,
    toStrongOpponentBoostParams(consistencySettings)
  )

  const actual_margin = team_a_score - team_b_score
  const prediction_error =
    pre.predictedMargin != null ? Math.abs(pre.predictedMargin - actual_margin) : null

  const { data: insertedMatch, error: matchInsertError } = await supabase
    .from('matches')
    .insert([
      {
        match_date,
        season,
        team_a_id,
        team_b_id,
        team_a_score,
        team_b_score,
      },
    ])
    .select('id')
    .single()

  if (matchInsertError || !insertedMatch) {
    return {
      ok: false,
      error: matchInsertError?.message || 'match insert failed',
      stage: 'matches_insert',
    }
  }

  const { data: phRow, error: phInsertError } = await supabase
    .from('prediction_history')
    .insert({
      season,
      match_date,
      team_a_id,
      team_b_id,
      predicted_margin: pre.predictedMargin,
      actual_margin,
      prediction_error,
      prediction_type: pre.predictionType,
      confidence: pre.confidence,
      model_version: PREDICTOR_MODEL_VERSION,
      was_pre_match_prediction: true,
      match_id: insertedMatch.id,
    })
    .select('id')
    .single()

  if (phInsertError || !phRow) {
    await supabase.from('matches').delete().eq('id', insertedMatch.id)
    return {
      ok: false,
      error: phInsertError?.message || 'prediction_history insert failed',
      stage: 'prediction_history_insert',
    }
  }

  await recalculateTeamConsistencyFromPredictionHistory(supabase, season, teams)

  return { ok: true, matchId: insertedMatch.id, predictionHistoryId: phRow.id }
}
