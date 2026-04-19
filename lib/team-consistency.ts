import type { SupabaseClient } from '@supabase/supabase-js'

export type TeamIdRow = { id: number }

export function classifyAnchorStatus(
  matchesEvaluated: number,
  adjustedConsistency: number
): 'trusted_anchor' | 'usable_reference' | 'unstable' | 'provisional' {
  if (matchesEvaluated >= 5 && adjustedConsistency >= 0.85) return 'trusted_anchor'
  if (matchesEvaluated >= 3 && adjustedConsistency >= 0.7) return 'usable_reference'
  if (matchesEvaluated >= 2) return 'unstable'
  return 'provisional'
}

type PredictionHistoryRow = {
  team_a_id: number
  team_b_id: number
  prediction_error: number | null
}

/**
 * Rebuild team_consistency for a season from completed prediction_history rows
 * (prediction_error IS NOT NULL). Each fixture error counts toward both teams.
 */
export async function recalculateTeamConsistencyFromPredictionHistory(
  supabase: SupabaseClient,
  season: number,
  allTeams: TeamIdRow[]
): Promise<{ ok: true; rowsWritten: number } | { ok: false; error: string; reason?: string }> {
  const { data: history, error } = await supabase
    .from('prediction_history')
    .select('team_a_id, team_b_id, prediction_error')
    .eq('season', season)

  if (error) {
    return { ok: false, error: error.message }
  }

  const rows = ((history || []) as PredictionHistoryRow[]).filter(
    (r) => r.prediction_error != null && !Number.isNaN(Number(r.prediction_error))
  )

  const stats = new Map<number, { total: number; n: number }>()
  for (const t of allTeams) {
    stats.set(t.id, { total: 0, n: 0 })
  }

  for (const row of rows) {
    const err = row.prediction_error
    if (err == null || Number.isNaN(err)) continue
    for (const tid of [row.team_a_id, row.team_b_id]) {
      const s = stats.get(tid)
      if (s) {
        s.total += err
        s.n += 1
      }
    }
  }

  const now = new Date().toISOString()
  const payload = allTeams.map((team) => {
    const s = stats.get(team.id) || { total: 0, n: 0 }
    const matches_evaluated = s.n
    const total_prediction_error = Math.round(s.total * 100) / 100
    const avg_prediction_error =
      matches_evaluated > 0 ? Math.round((s.total / matches_evaluated) * 1000) / 1000 : 0

    const consistency_score =
      matches_evaluated > 0
        ? Math.max(0, Math.min(1, 1 - avg_prediction_error / 20))
        : 0

    const sample_confidence = Math.min(matches_evaluated / 5, 1)
    const adjusted_consistency = consistency_score * sample_confidence

    const anchor_status = classifyAnchorStatus(matches_evaluated, adjusted_consistency)
    const is_anchor = anchor_status === 'trusted_anchor' || anchor_status === 'usable_reference'

    return {
      team_id: team.id,
      season,
      total_prediction_error,
      avg_prediction_error,
      matches_evaluated,
      consistency_score: Math.round(consistency_score * 1000) / 1000,
      sample_confidence: Math.round(sample_confidence * 1000) / 1000,
      adjusted_consistency: Math.round(adjusted_consistency * 1000) / 1000,
      is_anchor,
      anchor_status,
      updated_at: now,
      prediction_error: total_prediction_error,
    }
  })

  const { error: upsertError } = await supabase.from('team_consistency').upsert(payload, {
    onConflict: 'team_id,season',
  })

  if (upsertError) {
    return { ok: false, error: upsertError.message }
  }

  return { ok: true, rowsWritten: payload.length }
}
