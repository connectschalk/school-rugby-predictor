'use client'

import { useMemo, useState } from 'react'

type PredictionCardProps = {
  teamAName: string
  teamBName: string
  predictionMargin: number | null
  date: string
  rationale?: string
}

function normalizeTeamName(teamName: string) {
  return teamName.trim().toLowerCase().replace(/\s+/g, '-')
}

export function getTeamLogo(teamName: string) {
  return `/team-logos/${normalizeTeamName(teamName)}.png`
}

export function RugbyBallIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Rugby ball fallback"
      className="h-12 w-12 text-gray-700"
    >
      <ellipse
        cx="32"
        cy="32"
        rx="21"
        ry="13"
        fill="currentColor"
        transform="rotate(-22 32 32)"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="14"
        ry="9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        transform="rotate(-22 32 32)"
      />
      <line
        x1="24"
        y1="26"
        x2="40"
        y2="38"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line x1="30" y1="30" x2="34" y2="34" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="27" y1="28" x2="31" y2="32" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="33" y1="32" x2="37" y2="36" stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  )
}

export function TeamLogoCircle({
  teamName,
  sizeClassName = 'h-32 w-32 md:h-36 md:w-36',
  imageSizeClassName = 'h-[82%] w-[82%]',
}: {
  teamName: string
  sizeClassName?: string
  imageSizeClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const logoSrc = useMemo(() => getTeamLogo(teamName), [teamName])

  return (
    <div
      className={`flex items-center justify-center rounded-full border border-gray-200 bg-gray-50 ${sizeClassName}`}
    >
      {!failed && teamName ? (
        <img
          src={logoSrc}
          alt={`${teamName} logo`}
          className={`${imageSizeClassName} object-contain`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="scale-110">
          <RugbyBallIcon />
        </div>
      )}
    </div>
  )
}

export default function PredictionCard({
  teamAName,
  teamBName,
  predictionMargin,
  date,
  rationale = 'Based on connected results and network strength.',
}: PredictionCardProps) {
  const roundedMargin =
    predictionMargin === null || predictionMargin === undefined
      ? null
      : Math.round(predictionMargin)

  const winnerName =
    predictionMargin === null || roundedMargin === 0
      ? ''
      : predictionMargin > 0
        ? teamAName
        : teamBName

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
    <div className="mx-auto flex w-full max-w-[500px] flex-col items-center rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
      <img
        src="/nextplay-predictor.png"
        alt="NextPlay Predictor"
        className="h-14 w-auto"
      />

      <div className="mt-8 flex w-full items-center justify-center gap-6 md:gap-10">
        <div className="flex min-w-0 flex-col items-center">
          <TeamLogoCircle teamName={teamAName} />
          <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
            {teamAName || 'Team A'}
          </p>
        </div>

        <div className="pt-3 text-3xl font-bold text-gray-800 md:text-4xl">VS</div>

        <div className="flex min-w-0 flex-col items-center">
          <TeamLogoCircle teamName={teamBName} />
          <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
            {teamBName || 'Team B'}
          </p>
        </div>
      </div>

      <p className="mt-8 text-lg font-semibold text-gray-800">{headline}</p>
      <p className="mt-2 text-6xl font-black leading-none text-black md:text-7xl">
        {marginText}
      </p>
      <p className="mt-5 max-w-[420px] text-sm text-gray-600">{rationale}</p>
      <p className="mt-8 text-sm text-gray-500">{date}</p>
    </div>
  )
}
