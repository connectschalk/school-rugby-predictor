'use client'

import type { CommunityScorelineRow, CommunityStatsOkSoccer } from '@/lib/community-predictor'

function formatPctLabel(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

const RANK_LABELS = ['Most predicted score', 'Second', 'Third'] as const

export default function CommunityTopScorelines({
  stats,
}: {
  stats: CommunityStatsOkSoccer
}) {
  const lines = stats.top_scorelines.slice(0, 3)

  if (lines.length === 0) {
    return (
      <p className="mt-6 text-center text-sm text-gray-500">No community score predictions yet.</p>
    )
  }

  return (
    <div className="mt-6 space-y-3">
      <p className="text-center text-xs font-bold uppercase tracking-wide text-gray-500">
        Popular scorelines
      </p>
      <div className="mx-auto grid max-w-md gap-2">
        {lines.map((line: CommunityScorelineRow, index: number) => (
          <div
            key={`${line.home_score}-${line.away_score}`}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {RANK_LABELS[index] ?? `#${index + 1}`}
              </p>
              <p className="text-lg font-black tabular-nums text-gray-900">{line.label}</p>
            </div>
            <p className="text-sm font-bold tabular-nums text-gray-700">
              {formatPctLabel(line.percentage)}%
            </p>
          </div>
        ))}
      </div>
      {stats.community_average_label ? (
        <p className="text-center text-sm font-semibold text-gray-800">
          Community average score: {stats.community_average_label}
        </p>
      ) : null}
    </div>
  )
}
