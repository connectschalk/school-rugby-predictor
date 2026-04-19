'use client'

import { forwardRef } from 'react'
import { TeamLogoCircle } from '@/components/export/team-logo'

export type ExportCardFormat = 'square' | 'portrait'

export type RankingsRow = { id: number | string; name: string }

type FormatProps = {
  /** Optional fixed frame for social (Studio). Omitted on public predictor = natural width. */
  format?: ExportCardFormat
  className?: string
}

export type PredictionCardVariantProps = FormatProps & {
  variant?: 'prediction'
  homeTeamName: string
  awayTeamName: string
  /** Positive = home ahead (team A perspective). */
  predictionMargin: number | null
  date: string
  rationale?: string
  homeTeamLogo?: string
  awayTeamLogo?: string
}

export type PredictedVsActualVariantProps = FormatProps & {
  variant: 'predicted-vs-actual'
  homeTeamName: string
  awayTeamName: string
  predictedText: string
  actualText: string
  differenceText: string
  date: string
  homeTeamLogo?: string
  awayTeamLogo?: string
}

export type RankingsVariantProps = FormatProps & {
  variant: 'rankings'
  date: string
  rankings: RankingsRow[]
  title?: string
}

export type ExportPredictionCardProps =
  | PredictionCardVariantProps
  | PredictedVsActualVariantProps
  | RankingsVariantProps

function formatBoxStyle(format: ExportCardFormat | undefined) {
  if (!format) return undefined
  if (format === 'portrait') return { width: 540, height: 675, minHeight: 675 }
  return { width: 540, height: 540, minHeight: 540 }
}

const ExportPredictionCard = forwardRef<HTMLDivElement, ExportPredictionCardProps>(
  function ExportPredictionCard(props, ref) {
    const variant = props.variant ?? 'prediction'

    if (variant === 'rankings') {
      const { date, rankings, title = 'Network Rankings', format, className = '' } =
        props as RankingsVariantProps
      return (
        <div
          ref={ref}
          style={formatBoxStyle(format)}
          className={`mx-auto flex w-full max-w-[540px] flex-col rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm ${className}`.trim()}
        >
          <img
            src="/nextplay-predictor.png"
            alt="NextPlay Predictor"
            className="mx-auto h-14 w-auto max-w-full object-contain"
          />
          <p className="mt-4 text-center text-sm text-gray-500">{date}</p>
          <p className="mt-6 text-center text-xs uppercase tracking-[0.18em] text-gray-500">{title}</p>
          <div className="mt-6 space-y-2 text-left">
            {rankings.map((team, index) => (
              <div
                key={`${team.id}-${index}`}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
              >
                <span className="text-sm font-semibold text-gray-500">{index + 1}</span>
                <span className="ml-3 flex-1 text-sm font-medium text-gray-900">{team.name}</span>
              </div>
            ))}
            {rankings.length === 0 && (
              <p className="text-sm text-gray-500">No ranking data found for this season.</p>
            )}
          </div>
        </div>
      )
    }

    if (variant === 'predicted-vs-actual') {
      const {
        homeTeamName,
        awayTeamName,
        predictedText,
        actualText,
        differenceText,
        date,
        homeTeamLogo,
        awayTeamLogo,
        format,
        className = '',
      } = props as PredictedVsActualVariantProps
      return (
        <div
          ref={ref}
          style={formatBoxStyle(format)}
          className={`mx-auto flex w-full max-w-[500px] flex-col items-center rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm ${className}`.trim()}
        >
          <img
            src="/nextplay-predictor.png"
            alt="NextPlay Predictor"
            className="h-14 w-auto max-w-full object-contain"
          />

          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-gray-500">Predicted vs Actual</p>

          <div className="mt-6 flex w-full items-center justify-center gap-6 md:gap-10">
            <div className="flex min-w-0 flex-col items-center">
              <TeamLogoCircle
                teamName={homeTeamName}
                logoUrl={homeTeamLogo}
                sizeClassName="h-28 w-28 md:h-32 md:w-32"
                imageSizeClassName="h-[84%] w-[84%]"
              />
              <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
                {homeTeamName || 'Home Team'}
              </p>
            </div>

            <div className="pt-3 text-3xl font-bold text-gray-800 md:text-4xl">VS</div>

            <div className="flex min-w-0 flex-col items-center">
              <TeamLogoCircle
                teamName={awayTeamName}
                logoUrl={awayTeamLogo}
                sizeClassName="h-28 w-28 md:h-32 md:w-32"
                imageSizeClassName="h-[84%] w-[84%]"
              />
              <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
                {awayTeamName || 'Away Team'}
              </p>
            </div>
          </div>

          <div className="mt-8 w-full max-w-[420px] space-y-3 text-sm">
            <p className="rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-gray-500">Predicted:</span>{' '}
              <span className="font-semibold text-gray-900">{predictedText}</span>
            </p>
            <p className="rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-gray-500">Actual:</span>{' '}
              <span className="font-semibold text-gray-900">{actualText}</span>
            </p>
          </div>

          <p className="mt-5 text-sm text-gray-600">{differenceText}</p>
          <p className="mt-8 text-sm text-gray-500">{date}</p>
        </div>
      )
    }

    const {
      homeTeamName,
      awayTeamName,
      predictionMargin,
      date,
      rationale = 'Based on connected results and network strength.',
      homeTeamLogo,
      awayTeamLogo,
      format,
      className = '',
    } = props as PredictionCardVariantProps

    const roundedMargin =
      predictionMargin === null || predictionMargin === undefined
        ? null
        : Math.round(predictionMargin)

    const winnerName =
      predictionMargin === null || roundedMargin === 0
        ? ''
        : predictionMargin > 0
          ? homeTeamName
          : awayTeamName

    const headline =
      predictionMargin === null
        ? 'Prediction unavailable'
        : roundedMargin === 0
          ? 'Prediction Draw'
          : `Prediction ${winnerName} by`

    const marginText =
      predictionMargin === null
        ? '-'
        : roundedMargin === 0
          ? 'DRAW'
          : `${Math.round(Math.abs(predictionMargin))}`

    return (
      <div
        ref={ref}
        style={formatBoxStyle(format)}
        className={`mx-auto flex w-full max-w-[500px] flex-col items-center rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm ${className}`.trim()}
      >
        <img
          src="/nextplay-predictor.png"
          alt="NextPlay Predictor"
          className="h-14 w-auto max-w-full object-contain object-center"
        />

        <div className="mt-8 flex w-full items-center justify-center gap-6 md:gap-10">
          <div className="flex min-w-0 flex-col items-center">
            <TeamLogoCircle teamName={homeTeamName} logoUrl={homeTeamLogo} />
            <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
              {homeTeamName || 'Home Team'}
            </p>
          </div>

          <div className="pt-3 text-3xl font-bold text-gray-800 md:text-4xl">VS</div>

          <div className="flex min-w-0 flex-col items-center">
            <TeamLogoCircle teamName={awayTeamName} logoUrl={awayTeamLogo} />
            <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
              {awayTeamName || 'Away Team'}
            </p>
          </div>
        </div>

        <p className="mt-8 text-lg font-semibold text-gray-800">{headline}</p>
        <p className="mt-2 text-6xl font-black leading-none text-black md:text-7xl">{marginText}</p>
        <p className="mt-5 max-w-[420px] text-sm text-gray-600">{rationale}</p>
        <p className="mt-8 text-sm text-gray-500">{date}</p>
      </div>
    )
  }
)

export default ExportPredictionCard
