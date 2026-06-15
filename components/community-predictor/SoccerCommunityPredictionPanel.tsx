'use client'

import type { CommunityScorelineRow, CommunityStatsOkSoccer } from '@/lib/community-predictor'

function formatPctLabel(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function formatScorelineSpaced(home: number, away: number): string {
  return `${home} - ${away}`
}

function formatScorelineCompact(home: number, away: number): string {
  return `${home}-${away}`
}

function scorelineBarColor(line: CommunityScorelineRow): string {
  if (line.home_score > line.away_score) return 'bg-gray-900'
  if (line.away_score > line.home_score) return 'bg-red-700'
  return 'bg-gray-500'
}

export default function SoccerCommunityPredictionPanel({
  stats,
}: {
  stats: CommunityStatsOkSoccer
}) {
  const top5 = stats.top_scorelines.slice(0, 5)
  const mostPredicted = top5[0] ?? null
  const maxBarPct = top5.reduce((max, line) => Math.max(max, line.percentage), 0) || 1

  if (stats.total_predictions === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-medium text-gray-600">
        No community score predictions yet.
      </p>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h3 className="text-center text-xs font-bold uppercase tracking-wide text-gray-500">Result split</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-900 px-4 py-3 text-center text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">Home win</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatPctLabel(stats.home_prediction_pct)}%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-500 px-4 py-3 text-center text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">Draw</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatPctLabel(stats.draw_prediction_pct)}%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-red-700 px-4 py-3 text-center text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/80">Away win</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatPctLabel(stats.away_prediction_pct)}%</p>
          </div>
        </div>
      </section>

      {mostPredicted ? (
        <section className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5 text-center shadow-inner">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Most predicted score</p>
          <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-gray-900">
            {formatScorelineSpaced(mostPredicted.home_score, mostPredicted.away_score)}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-gray-700">
            {formatPctLabel(mostPredicted.percentage)}%
          </p>
        </section>
      ) : null}

      {top5.length > 0 ? (
        <section>
          <h3 className="text-center text-xs font-bold uppercase tracking-wide text-gray-500">Top 5 scorelines</h3>
          <div className="mt-3 space-y-2.5">
            {top5.map((line) => {
              const barWidth = Math.max(4, (line.percentage / maxBarPct) * 100)
              return (
                <div key={`${line.home_score}-${line.away_score}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-gray-900">
                    {formatScorelineCompact(line.home_score, line.away_score)}
                  </span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${scorelineBarColor(line)}`}
                      style={{ width: `${barWidth}%` }}
                      title={`${formatScorelineCompact(line.home_score, line.away_score)} ${formatPctLabel(line.percentage)}%`}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-gray-700">
                    {formatPctLabel(line.percentage)}%
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Community average</p>
        <p className="mt-2 text-2xl font-black tabular-nums text-gray-900">
          {stats.community_average_label ?? '—'}
        </p>
      </section>
    </div>
  )
}
