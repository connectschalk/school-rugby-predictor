'use client'

import type { CommunityBucketRow, CommunityMarginBucket, CommunityStatsOk } from '@/lib/community-predictor'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'

const HOME_BUCKETS: CommunityMarginBucket[] = ['20+', '15', '10', '5']
const AWAY_BUCKETS: CommunityMarginBucket[] = ['5', '10', '15', '20+']
const CHART_PX = 120

function formatPctLabel(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function bucketTooltipPhrase(bucket: CommunityMarginBucket): string {
  return bucket === '20+' ? '20+' : bucket
}

function buildBucketLookup(rows: CommunityBucketRow[]): Map<string, CommunityBucketRow> {
  const m = new Map<string, CommunityBucketRow>()
  for (const r of rows) {
    m.set(`${r.side}:${r.bucket}`, r)
  }
  return m
}

type BucketSlotProps = {
  side: 'home' | 'away'
  bucket: CommunityMarginBucket
  colorClass: string
  lookup: Map<string, CommunityBucketRow>
  homeTeam: string
  awayTeam: string
}

function CommunityBucketSlot({ side, bucket, colorClass, lookup, homeTeam, awayTeam }: BucketSlotProps) {
  const row = lookup.get(`${side}:${bucket}`)
  const pct = row?.percentage ?? 0
  const teamName = row?.team_name ?? (side === 'home' ? homeTeam : awayTeam)
  const h = Math.max(0, (pct / 100) * CHART_PX)
  const phrase = bucketTooltipPhrase(bucket)
  const tip = `${formatPctLabel(pct)}% predicted ${teamName} by ${phrase}`

  return (
    <div
      className="flex min-w-0 flex-col items-center justify-end"
      aria-label={tip}
    >
      <div className="flex h-[120px] w-full flex-col items-center justify-end">
        {pct > 0 ? (
          <div
            className={`w-9 shrink-0 rounded-t-md ${colorClass}`}
            style={{ height: `${h}px` }}
            title={tip}
          />
        ) : null}
      </div>
      <span className="mt-2 w-full text-center text-[9px] font-bold tabular-nums leading-tight text-gray-700">
        {bucket}
      </span>
    </div>
  )
}

function CommunityCenterAxisSlot() {
  return (
    <div className="flex min-w-0 flex-col items-center justify-end">
      <div className="flex h-[120px] w-full flex-col items-center justify-end">
        <div
          className="h-full w-1.5 shrink-0 rounded-full bg-gray-950 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          aria-hidden
        />
      </div>
      <span className="mt-2 text-[9px] font-black tabular-nums text-gray-950">0</span>
    </div>
  )
}

export default function CommunityDistributionPanel({ stats }: { stats: CommunityStatsOk }) {
  const homeLogo = getSchoolTeamLogoPath(stats.home_team)
  const awayLogo = getSchoolTeamLogoPath(stats.away_team)
  const lookup = buildBucketLookup(stats.bucket_rows)

  const yours =
    stats.user_locked_winner != null && stats.user_locked_margin != null
      ? `${stats.user_locked_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.user_locked_margin}`
      : null

  const avgLine =
    stats.community_average_label != null
      ? `Community average: ${stats.community_average_label}`
      : 'Community average: —'

  const formattedDate = new Date(stats.kickoff_time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg shadow-black/10 sm:p-8">
      <div className="border-b border-gray-100">
        <div className="grid grid-cols-3 items-center w-full mb-8 px-2 sm:px-6">
          {/* LEFT TEAM (HOME) */}
          <div className="flex min-w-0 flex-col items-end text-right">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
              {homeLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={homeLogo} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border border-gray-300 text-xl font-black text-gray-700">
                  {stats.home_team.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="mt-2 line-clamp-2 font-semibold text-gray-900">{stats.home_team}</div>
            <div className="text-sm tracking-wide text-gray-500">HOME</div>
          </div>

          {/* CENTER (VS + DATE) */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-xs tracking-widest text-gray-400">VS</div>
            <div className="text-sm text-gray-500">{formattedDate}</div>
          </div>

          {/* RIGHT TEAM (AWAY) */}
          <div className="flex min-w-0 flex-col items-start text-left">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center sm:h-20 sm:w-20">
              {awayLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={awayLogo} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border border-gray-300 text-xl font-black text-gray-700">
                  {stats.away_team.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="mt-2 line-clamp-2 font-semibold text-gray-900">{stats.away_team}</div>
            <div className="text-sm tracking-wide text-red-500">AWAY</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-700 sm:text-sm">
        <span className="rounded-full bg-gray-900 px-3 py-1 font-semibold text-white">
          Home {formatPctLabel(stats.home_prediction_pct)}%
        </span>
        <span className="rounded-full bg-red-700 px-3 py-1 font-semibold text-white">
          Away {formatPctLabel(stats.away_prediction_pct)}%
        </span>
        {yours ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 font-medium text-red-900">
            You: <strong>{yours}</strong>
          </span>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm font-semibold text-gray-900">{avgLine}</p>

      <div className="mt-6">
        <div className="overflow-x-auto">
          <div className="mx-auto min-w-[360px] max-w-[420px] sm:min-w-[420px]">
            <div className="mx-auto grid w-full grid-cols-9 items-end gap-x-1 pb-1">
              {HOME_BUCKETS.map((b) => (
                <CommunityBucketSlot
                  key={`home-${b}`}
                  side="home"
                  bucket={b}
                  colorClass="bg-[#111318]"
                  lookup={lookup}
                  homeTeam={stats.home_team}
                  awayTeam={stats.away_team}
                />
              ))}
              <CommunityCenterAxisSlot />
              {AWAY_BUCKETS.map((b) => (
                <CommunityBucketSlot
                  key={`away-${b}`}
                  side="away"
                  bucket={b}
                  colorClass="bg-red-700"
                  lookup={lookup}
                  homeTeam={stats.home_team}
                  awayTeam={stats.away_team}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-3 max-w-xl text-center text-[11px] text-gray-500">
          Bars show the percentage of users who picked each margin range.
        </p>

        <div className="mt-3 flex justify-between gap-2 text-[8px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[9px]">
          <span className="min-w-0 flex-1 text-right text-gray-800">← {stats.home_team}</span>
          <span className="min-w-0 flex-1 truncate text-left text-red-800">{stats.away_team} →</span>
        </div>
      </div>
    </div>
  )
}
