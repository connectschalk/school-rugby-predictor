import {
  buildCommunityStatsOkFromMarginPicks,
  buildCommunityStatsOkFromSoccerPicks,
  type CommunityStatsOk,
  type SoccerScorePick,
  type WinnerMarginPick,
} from './community-predictor'
import type { CompetitionScoringMode } from './competitions'
import { isSoccerExactScoreMode } from './competitions'
import type { GameMatch } from '@/lib/public-prediction-game'

export type PoolMatchPredictionViewerRow = {
  user_id: string
  predicted_winner: string | null
  predicted_margin: number | null
  predicted_home_score: number | null
  predicted_away_score: number | null
  reveal_allowed: boolean
  is_viewer: boolean
}

function matchSlice(match: GameMatch & { prediction_cutoff_time?: string | null }) {
  return {
    id: match.id,
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_time: match.kickoff_time,
    status: match.status,
    home_score: match.home_score,
    away_score: match.away_score,
  }
}

/**
 * Build CommunityStatsOk from pool RPC rows (revealed picks only) for CommunityDistributionPanel.
 */
export function buildPoolCommunityStatsOk(
  match: GameMatch & { prediction_cutoff_time?: string | null },
  rows: PoolMatchPredictionViewerRow[],
  scoringMode: CompetitionScoringMode = 'rugby_margin'
): CommunityStatsOk {
  const slice = matchSlice(match)

  if (isSoccerExactScoreMode(scoringMode)) {
    const revealed = rows.filter(
      (r) =>
        r.reveal_allowed &&
        r.predicted_home_score != null &&
        r.predicted_away_score != null
    )
    const picks: SoccerScorePick[] = revealed.map((r) => ({
      homeScore: Math.trunc(Number(r.predicted_home_score)),
      awayScore: Math.trunc(Number(r.predicted_away_score)),
    }))

    const viewerRow = rows.find((r) => r.is_viewer)
    const viewerPick: SoccerScorePick | null =
      viewerRow?.predicted_home_score != null && viewerRow?.predicted_away_score != null
        ? {
            homeScore: Math.trunc(Number(viewerRow.predicted_home_score)),
            awayScore: Math.trunc(Number(viewerRow.predicted_away_score)),
          }
        : null

    return buildCommunityStatsOkFromSoccerPicks(slice, picks, { viewerPick })
  }

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

  return buildCommunityStatsOkFromMarginPicks(slice, picks, { viewerPick })
}

/** Soccer pool row has a valid exact-score pick. */
export function poolRowHasSoccerPick(row: {
  predicted_home_score: number | null
  predicted_away_score: number | null
}): boolean {
  return row.predicted_home_score != null && row.predicted_away_score != null
}

export function poolRowSoccerResultSide(row: {
  predicted_home_score: number | null
  predicted_away_score: number | null
}): 'home' | 'away' | 'draw' | null {
  if (!poolRowHasSoccerPick(row)) return null
  const h = Math.trunc(Number(row.predicted_home_score))
  const a = Math.trunc(Number(row.predicted_away_score))
  if (h > a) return 'home'
  if (a > h) return 'away'
  return 'draw'
}
