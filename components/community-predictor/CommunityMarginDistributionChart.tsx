'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import LetterAvatar from '@/components/LetterAvatar'
import { PLATFORM_LOGO_ALT, PLATFORM_PREDICTOR_MARK_SRC } from '@/lib/platform-branding'
import type { PredictorAppChartPick } from '@/lib/fixture-model-for-match'
import type { CommunityBucketRow, CommunityMarginBucket, CommunityStatsOk } from '@/lib/community-predictor'

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
    <div className="flex min-w-0 flex-col items-center justify-end" aria-label={tip}>
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** 0–8 axis slot: 0 = home 20+, 4 = center, 8 = away 20+ */
export function axisSlotForWinnerMargin(winner: 'home' | 'away', margin: number): number {
  const m = Math.max(0, Math.trunc(margin))
  if (m >= 20) return winner === 'home' ? 0 : 8
  const wholeSteps = Math.floor(m / 5)
  const fraction = (m % 5) / 5
  if (winner === 'home') {
    return clamp(4 - wholeSteps - fraction, 0, 8)
  }
  return clamp(4 + wholeSteps + fraction, 0, 8)
}

type ViewerAvatar = {
  displayName: string
  avatarUrl: string | null
  avatarLetter: string | null
  avatarColour: string | null
}

type CommunityMarginDistributionChartProps = {
  stats: CommunityStatsOk
  viewerAvatar: ViewerAvatar | null
  /** Model / app pick marker (NextPlay logo); independent of viewer avatar. */
  predictorAppPick?: PredictorAppChartPick | null
  /** Default on in Community Picks; one-match preview sets false when helper sits above. */
  showFooterCaption?: boolean
  /** Outer wrapper spacing (default matches Community Picks panel). */
  rootClassName?: string
}

const PREDICTOR_MARKER_SIZE = 26

export default function CommunityMarginDistributionChart({
  stats,
  viewerAvatar,
  predictorAppPick = null,
  showFooterCaption = true,
  rootClassName = 'mt-6',
}: CommunityMarginDistributionChartProps) {
  const lookup = buildBucketLookup(stats.bucket_rows)

  const yours =
    stats.user_locked_winner != null && stats.user_locked_margin != null
      ? `${stats.user_locked_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.user_locked_margin}`
      : null

  const scoresExist = stats.home_score != null && stats.away_score != null

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
    return axisSlotForWinnerMargin(stats.actual_winner, stats.actual_margin ?? 0)
  }, [scoresExist, stats.actual_margin, stats.actual_winner])

  const slotWidth = chartWidth > 0 ? chartWidth / 9 : 0
  const actualLeftPx =
    actualAxisPosition != null && slotWidth > 0 ? actualAxisPosition * slotWidth + slotWidth / 2 : null

  const viewerAxisPosition = useMemo(() => {
    if (stats.user_locked_winner == null || stats.user_locked_margin == null) return null
    return axisSlotForWinnerMargin(stats.user_locked_winner, stats.user_locked_margin)
  }, [stats.user_locked_margin, stats.user_locked_winner])
  const viewerLeftPx =
    viewerAxisPosition != null && slotWidth > 0 ? viewerAxisPosition * slotWidth + slotWidth / 2 : null

  const predictorAxisPosition = useMemo(() => {
    if (!predictorAppPick) return null
    return axisSlotForWinnerMargin(predictorAppPick.winner, predictorAppPick.margin)
  }, [predictorAppPick])

  const predictorLeftPx =
    predictorAxisPosition != null && slotWidth > 0 ? predictorAxisPosition * slotWidth + slotWidth / 2 : null

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

  const actualBottomPx = markerBaselinePx
  let viewerBottomPx = markerBaselinePx
  let predictorBottomPx = markerBaselinePx

  if (
    actualLeftPx != null &&
    viewerLeftPx != null &&
    Math.abs(actualLeftPx - viewerLeftPx) < overlapThreshold
  ) {
    viewerBottomPx = markerBaselinePx + 18
  }

  if (predictorLeftPx != null) {
    const nearActual =
      actualLeftPx != null && Math.abs(predictorLeftPx - actualLeftPx) < overlapThreshold
    const nearViewer =
      viewerLeftPx != null && Math.abs(predictorLeftPx - viewerLeftPx) < overlapThreshold
    if (nearActual && nearViewer) {
      predictorBottomPx = markerBaselinePx + 36
    } else if (nearActual) {
      predictorBottomPx = markerBaselinePx + 18
    } else if (nearViewer) {
      predictorBottomPx = viewerBottomPx + 18
    }
  }

  return (
    <div className={rootClassName}>
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
                title={
                  !scoresExist || stats.actual_winner == null
                    ? undefined
                    : stats.actual_winner === 'draw'
                      ? 'Actual margin: Draw'
                      : `Actual margin: ${stats.actual_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.actual_margin ?? 0}`
                }
                aria-label={
                  !scoresExist || stats.actual_winner == null
                    ? undefined
                    : stats.actual_winner === 'draw'
                      ? 'Actual margin: Draw'
                      : `Actual margin: ${stats.actual_winner === 'home' ? stats.home_team : stats.away_team} by ${stats.actual_margin ?? 0}`
                }
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
                  size={VIEWER_MARKER_SIZE}
                  className="ring-2 ring-white shadow-md"
                />
              </div>
            ) : null}
            {predictorLeftPx != null && predictorAppPick ? (
              <div
                className="group/pred absolute z-[25]"
                style={{
                  left: `${predictorLeftPx}px`,
                  bottom: `${predictorBottomPx}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <button
                  type="button"
                  className="relative flex h-[30px] w-[30px] cursor-default items-center justify-center rounded-full bg-white p-0.5 shadow-md ring-2 ring-gray-900/10"
                  title={predictorAppPick.tooltipTitle}
                  aria-label={predictorAppPick.tooltipTitle}
                >
                  <Image
                    src={PLATFORM_PREDICTOR_MARK_SRC}
                    alt={PLATFORM_LOGO_ALT}
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 hidden min-w-[10rem] -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2 py-1 text-center text-[10px] font-semibold text-gray-800 shadow-md group-hover/pred:block sm:text-xs">
                  {predictorAppPick.tooltipTitle}
                </span>
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

      {showFooterCaption ? (
        <p className="mx-auto mt-3 max-w-xl text-center text-[11px] text-gray-500">
          Bars show the percentage of users who picked each margin range.
        </p>
      ) : null}

      <div className="mt-3 flex justify-between gap-2 text-[8px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[9px]">
        <span className="min-w-0 flex-1 text-right text-gray-800">← {stats.home_team}</span>
        <span className="min-w-0 flex-1 truncate text-left text-red-800">{stats.away_team} →</span>
      </div>
    </div>
  )
}
