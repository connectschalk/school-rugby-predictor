'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import LetterAvatar from '@/components/LetterAvatar'
import {
  formatCommunityMatchScheduleLine,
  type CommunityBucketRow,
  type CommunityMarginBucket,
  type CommunityStatsOk,
} from '@/lib/community-predictor'
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

function CommunityBucketSlot({
  side,
  bucket,
  colorClass,
  lookup,
  homeTeam,
  awayTeam,
}: BucketSlotProps) {
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

function marginToBucket(margin: number): CommunityMarginBucket {
  if (margin <= 5) return '5'
  if (margin <= 10) return '10'
  if (margin <= 15) return '15'
  return '20+'
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

type ViewerAvatar = {
  displayName: string
  avatarUrl: string | null
  avatarLetter: string | null
  avatarColour: string | null
}

export default function CommunityDistributionPanel({
  stats,
  viewerAvatar,
}: {
  stats: CommunityStatsOk
  viewerAvatar: ViewerAvatar | null
}) {
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

  const scheduleLine = formatCommunityMatchScheduleLine(stats.kickoff_time, stats.status)
  const scoresExist = stats.home_score != null && stats.away_score != null
  const scoreLine = scoresExist ? `${stats.home_score} - ${stats.away_score}` : null
  const actualBucket = stats.actual_margin != null ? marginToBucket(stats.actual_margin) : null
  const actualDotTitle =
    !scoresExist || stats.actual_winner == null
      ? undefined
      : stats.actual_winner === 'draw'
        ? 'Actual margin: Draw'
        : `Actual margin: ${stats.actual_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.actual_margin ?? 0}`
  const actualLine =
    !scoresExist || stats.actual_winner == null
      ? null
      : stats.actual_winner === 'draw'
        ? 'Actual: Draw'
        : `Actual: ${stats.actual_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.actual_margin ?? 0}`
  const showDotAt = (side: 'home' | 'away', bucket: CommunityMarginBucket): boolean =>
    Boolean(scoresExist && stats.actual_winner === side && actualBucket === bucket)
  const showDrawDot = Boolean(scoresExist && stats.actual_winner === 'draw')
  const chartRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    if (!chartRef.current) return
    const node = chartRef.current
    const update = () => setChartWidth(node.offsetWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const actualAxisPosition = useMemo(() => {
    if (!scoresExist || stats.actual_winner == null) return null
    if (stats.actual_winner === 'draw') return 4
    const margin = Math.max(0, stats.actual_margin ?? 0)
    if (margin >= 20) return stats.actual_winner === 'home' ? 0 : 8
    const wholeSteps = Math.floor(margin / 5)
    const fraction = (margin % 5) / 5
    if (stats.actual_winner === 'home') {
      return clamp(4 - wholeSteps - fraction, 0, 8)
    }
    return clamp(4 + wholeSteps + fraction, 0, 8)
  }, [scoresExist, stats.actual_margin, stats.actual_winner])

  const slotWidth = chartWidth > 0 ? chartWidth / 9 : 0
  const actualLeftPx = actualAxisPosition != null && slotWidth > 0 ? actualAxisPosition * slotWidth + slotWidth / 2 : null
  const viewerAxisPosition = useMemo(() => {
    if (stats.user_locked_winner == null || stats.user_locked_margin == null) return null
    const margin = Math.max(0, stats.user_locked_margin)
    if (margin >= 20) return stats.user_locked_winner === 'home' ? 0 : 8
    const wholeSteps = Math.floor(margin / 5)
    const fraction = (margin % 5) / 5
    if (stats.user_locked_winner === 'home') {
      return clamp(4 - wholeSteps - fraction, 0, 8)
    }
    return clamp(4 + wholeSteps + fraction, 0, 8)
  }, [stats.user_locked_margin, stats.user_locked_winner])
  const viewerLeftPx =
    viewerAxisPosition != null && slotWidth > 0 ? viewerAxisPosition * slotWidth + slotWidth / 2 : null

  const pctAtSlot = (i: number): number => {
    if (i === 0) return lookup.get('home:20+')?.percentage ?? 0
    if (i === 1) return lookup.get('home:15')?.percentage ?? 0
    if (i === 2) return lookup.get('home:10')?.percentage ?? 0
    if (i === 3) return lookup.get('home:5')?.percentage ?? 0
    if (i === 4) return 0
    if (i === 5) return lookup.get('away:5')?.percentage ?? 0
    if (i === 6) return lookup.get('away:10')?.percentage ?? 0
    if (i === 7) return lookup.get('away:15')?.percentage ?? 0
    return lookup.get('away:20+')?.percentage ?? 0
  }

  const nearestIndex = actualAxisPosition == null ? null : clamp(Math.round(actualAxisPosition), 0, 8)
  const nearestPct = nearestIndex == null ? 0 : pctAtSlot(nearestIndex)
  const nearestBarHeight = Math.max(0, (nearestPct / 100) * CHART_PX)
  const LABEL_ZONE_PX = 22
  const markerBaselinePx = LABEL_ZONE_PX + (nearestPct > 0 ? nearestBarHeight + 8 : 8)
  const ACTUAL_MARKER_SIZE = 20
  const VIEWER_MARKER_SIZE = 26
  const overlapThreshold = Math.min(ACTUAL_MARKER_SIZE, VIEWER_MARKER_SIZE) * 0.5
  const markersOverlap =
    actualLeftPx != null &&
    viewerLeftPx != null &&
    Math.abs(actualLeftPx - viewerLeftPx) < overlapThreshold
  const actualBottomPx = markerBaselinePx
  const viewerBottomPx = markersOverlap ? markerBaselinePx + 18 : markerBaselinePx

  return (
    <div className="w-full max-w-full overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-lg shadow-black/10 sm:p-8">
      <div className="border-b border-gray-100">
        <div className="mb-8 grid w-full grid-cols-3 items-center px-2 sm:px-6">
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

          {/* CENTER (DATE + VS / SCORE) */}
          <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 text-center sm:min-h-[5rem]">
            {scheduleLine ? (
              <div className="max-w-[15rem] px-1 text-[11px] font-semibold leading-tight text-gray-600 sm:text-xs">
                {scheduleLine}
              </div>
            ) : null}
            {scoreLine ? (
              <div className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{scoreLine}</div>
            ) : (
              <div className="text-xs tracking-widest text-gray-400">VS</div>
            )}
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
      </div>
      {yours && viewerAvatar ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-800">
          <LetterAvatar
            letter={viewerAvatar.avatarLetter}
            colour={viewerAvatar.avatarColour}
            avatarUrl={viewerAvatar.avatarUrl}
            displayName={viewerAvatar.displayName}
            name={viewerAvatar.displayName}
            size={22}
            className="ring-1 ring-gray-300 shadow-sm"
          />
          <span>
            You picked: <strong>{yours}</strong>
          </span>
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm font-semibold text-gray-900">{avgLine}</p>
      {(actualLine || (yours && viewerAvatar)) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold text-gray-900">
          {actualLine ? (
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-4 w-4 rounded-full bg-green-600" aria-hidden />
              <span>Actual</span>
            </div>
          ) : null}
          {yours && viewerAvatar ? (
            <div className="inline-flex items-center gap-2">
              <LetterAvatar
                letter={viewerAvatar.avatarLetter}
                colour={viewerAvatar.avatarColour}
                avatarUrl={viewerAvatar.avatarUrl}
                displayName={viewerAvatar.displayName}
                name={viewerAvatar.displayName}
                size={18}
                className="ring-1 ring-gray-300"
              />
              <span>You</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <div className="max-w-full overflow-x-auto">
          <div className="mx-auto min-w-[360px] max-w-[420px] sm:min-w-[420px]">
            <div ref={chartRef} className="relative mx-auto">
              {actualLeftPx != null ? (
                <div
                  className="pointer-events-none absolute z-10"
                  style={{
                    left: `${actualLeftPx}px`,
                    bottom: `${actualBottomPx}px`,
                    transform: 'translateX(-50%)',
                  }}
                  title={actualDotTitle}
                  aria-label={actualDotTitle}
                >
                  <span className="inline-flex h-5 w-5 rounded-full bg-green-600 ring-2 ring-white" />
                </div>
              ) : null}
              {viewerLeftPx != null && viewerAvatar ? (
                <div
                  className="pointer-events-none absolute z-20"
                  style={{
                    left: `${viewerLeftPx}px`,
                    bottom: `${viewerBottomPx}px`,
                    transform: 'translateX(-50%)',
                  }}
                  title={yours ?? undefined}
                  aria-label={yours ?? undefined}
                >
                  <LetterAvatar
                    letter={viewerAvatar.avatarLetter}
                    colour={viewerAvatar.avatarColour}
                    avatarUrl={viewerAvatar.avatarUrl}
                    displayName={viewerAvatar.displayName}
                    name={viewerAvatar.displayName}
                    size={26}
                    className="ring-2 ring-white shadow-md"
                  />
                </div>
              ) : null}
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
