import type { SupabaseClient } from '@supabase/supabase-js'
import { canEditPredictionOnMatch } from '@/lib/prediction-cutoff'
import type { GameMatch, UserPredictionRow } from '@/lib/public-prediction-game'

/** Returned when no editable rows had an unlocked saved prediction. */
export const LOCK_ALL_NO_CANDIDATES = 'NO_LOCK_CANDIDATES'

/**
 * Lock every saved prediction that is still unlocked for matches where the client may still edit
 * (upcoming + kickoff in the future). Same rules as Predict a Score “lock all”.
 */
export async function lockAllUnlockedSavedForEditableMatches(
  client: SupabaseClient,
  allMatches: GameMatch[],
  predictions: Map<string, UserPredictionRow>,
  at: Date = new Date()
): Promise<{ locked: number; error: Error | null }> {
  const editable = allMatches.filter((m) => canEditPredictionOnMatch(m, at))
  const toLock: UserPredictionRow[] = []
  for (const m of editable) {
    const p = predictions.get(m.id)
    if (p?.id && !p.is_locked) toLock.push(p)
  }
  if (toLock.length === 0) {
    return { locked: 0, error: new Error(LOCK_ALL_NO_CANDIDATES) }
  }

  let locked = 0
  for (const p of toLock) {
    const { error } = await client
      .from('user_predictions')
      .update({ is_locked: true, locked_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('is_locked', false)
    if (error) {
      return { locked, error: new Error(error.message) }
    }
    locked += 1
  }
  return { locked, error: null }
}
