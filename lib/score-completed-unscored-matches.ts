import type { SupabaseClient } from '@supabase/supabase-js'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'

async function fetchMatchIdsForTable(
  supabase: SupabaseClient,
  table: 'user_predictions' | 'user_prediction_scores',
  eligibleMatchIds: Set<string>
): Promise<Set<string>> {
  const out = new Set<string>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('match_id').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const r of data) {
      const id = (r as { match_id: string }).match_id
      if (eligibleMatchIds.has(id)) out.add(id)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

export type ScoreCompletedMatchesOptions = {
  /**
   * When true (default), only matches that have predictions but no `user_prediction_scores` rows.
   * When false, all completed-with-results matches that have predictions (re-run scoring; still idempotent).
   */
  onlyWithoutScores: boolean
}

/**
 * Completed fixtures with results and at least one user_prediction. Optionally restricted to those with no
 * `user_prediction_scores` yet. Runs `score_predictions_for_match` for each — idempotent.
 */
export async function scoreCompletedPredictionMatches(
  supabase: SupabaseClient,
  options: ScoreCompletedMatchesOptions = { onlyWithoutScores: true }
): Promise<{
  matchIdsAttempted: number
  matchesScoredOk: number
  scoringErrors: string[]
}> {
  const { data: completedRows, error: gmErr } = await supabase
    .from('game_matches')
    .select('id')
    .eq('status', 'completed')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)

  if (gmErr) throw new Error(gmErr.message)

  const eligibleMatchIds = new Set((completedRows ?? []).map((r) => (r as { id: string }).id))

  const [withPredictions, withScores] = await Promise.all([
    fetchMatchIdsForTable(supabase, 'user_predictions', eligibleMatchIds),
    fetchMatchIdsForTable(supabase, 'user_prediction_scores', eligibleMatchIds),
  ])

  const targets: string[] = []
  for (const mid of withPredictions) {
    if (options.onlyWithoutScores) {
      if (!withScores.has(mid)) targets.push(mid)
    } else {
      targets.push(mid)
    }
  }

  const scoringErrors: string[] = []
  let matchesScoredOk = 0
  for (const matchId of targets) {
    const { error } = await rpcScorePredictionsForMatch(supabase, matchId)
    if (error) scoringErrors.push(`${matchId}: ${error.message}`)
    else matchesScoredOk += 1
  }

  return {
    matchIdsAttempted: targets.length,
    matchesScoredOk,
    scoringErrors,
  }
}
