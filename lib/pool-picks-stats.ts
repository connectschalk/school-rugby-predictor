import {
  buildCommunityStatsOkFromMarginPicks,
  type CommunityStatsOk,
  type WinnerMarginPick,
} from '@/lib/community-predictor'
import type { GameMatch } from '@/lib/public-prediction-game'

export type PoolMatchPredictionViewerRow = {
  user_id: string
  predicted_winner: string | null
  predicted_margin: number | null
  reveal_allowed: boolean
  is_viewer: boolean
}

/**
 * Build CommunityStatsOk from pool RPC rows (revealed picks only) for CommunityDistributionPanel.
 */
export function buildPoolCommunityStatsOk(
  match: GameMatch & { prediction_cutoff_time?: string | null },
  rows: PoolMatchPredictionViewerRow[]
): CommunityStatsOk {
  const revealed = rows.filter(
    (r) => r.reveal_allowed && r.predicted_winner && (r.predicted_winner === 'home' || r.predicted_winner === 'away')
  )
  const picks: WinnerMarginPick[] = revealed
    .map((r) => ({
      side: r.predicted_winner as 'home' | 'away',
      margin: Math.max(0, Math.trunc(Number(r.predicted_margin ?? 0))),
    }))
    .filter((p) => Number.isFinite(p.margin))

  const viewerRow = rows.find((r) => r.is_viewer)
  const uw = viewerRow?.predicted_winner
  const um = viewerRow?.predicted_margin
  const viewerPick: WinnerMarginPick | null =
    uw === 'home' || uw === 'away'
      ? { side: uw, margin: Math.max(0, Math.trunc(Number(um ?? 0))) }
      : null

  return buildCommunityStatsOkFromMarginPicks(
    {
      id: match.id,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_time: match.kickoff_time,
      status: match.status,
      home_score: match.home_score,
      away_score: match.away_score,
    },
    picks,
    { viewerPick }
  )
}
