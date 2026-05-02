import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Runs the canonical DB scoring for a single game_matches row (`score_predictions_for_match`).
 * Idempotent: deletes prior user_prediction_scores for the match and reinserts.
 */
export async function rpcScorePredictionsForMatch(
  client: SupabaseClient,
  matchId: string
): Promise<{ scoredCount: number; error: Error | null }> {
  const { data, error } = await client.rpc('score_predictions_for_match', { p_match_id: matchId })
  if (error) return { scoredCount: 0, error: new Error(error.message) }
  const n = typeof data === 'number' ? data : Number(data)
  return { scoredCount: Number.isFinite(n) ? n : 0, error: null }
}
