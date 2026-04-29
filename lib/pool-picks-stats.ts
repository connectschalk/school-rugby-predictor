import type { CommunityBucketRow, CommunityMarginBucket, CommunityStatsOk } from '@/lib/community-predictor'
import type { GameMatch } from '@/lib/public-prediction-game'

const BUCKETS: CommunityMarginBucket[] = ['5', '10', '15', '20+']

export type PoolMatchPredictionViewerRow = {
  user_id: string
  predicted_winner: string | null
  predicted_margin: number | null
  reveal_allowed: boolean
  is_viewer: boolean
}

function marginToBucket(margin: number): CommunityMarginBucket {
  const m = Math.abs(Math.trunc(margin))
  if (m <= 5) return '5'
  if (m <= 10) return '10'
  if (m <= 15) return '15'
  return '20+'
}

function parseActualWinner(
  homeScore: number | null,
  awayScore: number | null
): 'home' | 'away' | 'draw' | null {
  if (homeScore == null || awayScore == null) return null
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return 'draw'
}

function communityAverageLabel(
  homeTeam: string,
  awayTeam: string,
  margins: { side: 'home' | 'away'; margin: number }[]
): string | null {
  if (!margins.length) return null
  let signedSum = 0
  for (const x of margins) {
    signedSum += x.side === 'home' ? -x.margin : x.margin
  }
  const avg = signedSum / margins.length
  if (Math.abs(avg) < 0.25) return 'Draw / even'
  if (avg < 0) return `${homeTeam} by ${Math.round(Math.abs(avg))}`
  return `${awayTeam} by ${Math.round(avg)}`
}

/**
 * Build CommunityStatsOk from pool RPC rows (revealed picks only) for CommunityDistributionPanel.
 */
export function buildPoolCommunityStatsOk(
  match: GameMatch & { prediction_cutoff_time?: string | null },
  rows: PoolMatchPredictionViewerRow[]
): CommunityStatsOk {
  const hs = match.home_score
  const ascr = match.away_score
  const actualWinner = match.status === 'completed' ? parseActualWinner(hs, ascr) : null
  const actualMargin =
    hs != null && ascr != null ? Math.abs(Math.trunc(hs - ascr)) : null

  const revealed = rows.filter(
    (r) => r.reveal_allowed && r.predicted_winner && (r.predicted_winner === 'home' || r.predicted_winner === 'away')
  )
  const picks = revealed
    .map((r) => ({
      side: r.predicted_winner as 'home' | 'away',
      margin: Math.max(0, Math.trunc(Number(r.predicted_margin ?? 0))),
    }))
    .filter((p) => Number.isFinite(p.margin))

  const total = picks.length
  let homeC = 0
  let awayC = 0
  const bucketTally = new Map<string, number>()
  for (const p of picks) {
    if (p.side === 'home') homeC += 1
    else awayC += 1
    const b = marginToBucket(p.margin)
    const key = `${p.side}:${b}`
    bucketTally.set(key, (bucketTally.get(key) ?? 0) + 1)
  }

  const bucket_rows: CommunityBucketRow[] = []
  for (const side of ['home', 'away'] as const) {
    for (const bucket of BUCKETS) {
      const c = bucketTally.get(`${side}:${bucket}`) ?? 0
      const pct = total > 0 ? Math.round((c / total) * 1000) / 10 : 0
      bucket_rows.push({
        side,
        bucket,
        percentage: pct,
        team_name: side === 'home' ? match.home_team : match.away_team,
      })
    }
  }

  let homePct = total > 0 ? Math.round((homeC / total) * 1000) / 10 : 0
  let awayPct = total > 0 ? Math.round((awayC / total) * 1000) / 10 : 0
  if (total === 0) {
    homePct = 0
    awayPct = 0
  }

  const viewerRow = rows.find((r) => r.is_viewer)
  const uw = viewerRow?.predicted_winner
  const um = viewerRow?.predicted_margin

  return {
    allowed: true,
    reason: null,
    match_id: match.id,
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_time: match.kickoff_time,
    status: match.status,
    home_score: hs,
    away_score: ascr,
    actual_winner: actualWinner,
    actual_margin: actualMargin,
    total_predictions: total,
    home_prediction_count: homeC,
    away_prediction_count: awayC,
    home_prediction_pct: homePct,
    away_prediction_pct: awayPct,
    bucket_rows,
    community_average_label: communityAverageLabel(match.home_team, match.away_team, picks),
    user_locked_winner: uw === 'away' ? 'away' : uw === 'home' ? 'home' : null,
    user_locked_margin:
      uw === 'home' || uw === 'away' ? Math.max(0, Math.trunc(Number(um ?? 0))) : null,
  }
}
