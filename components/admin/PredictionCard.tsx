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

function RugbyBallIcon() {
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

function TeamLogoCircle({ teamName }: { teamName: string }) {
  const [failed, setFailed] = useState(false)
  const logoSrc = useMemo(() => getTeamLogo(teamName), [teamName])

  return (
    <div className="flex h-32 w-32 items-center justify-center rounded-full border border-gray-200 bg-gray-50 md:h-36 md:w-36">
      {!failed && teamName ? (
        <img
          src={logoSrc}
          alt={`${teamName} logo`}
          className="h-20 w-20 object-contain md:h-24 md:w-24"
          onError={() => setFailed(true)}
        />
      ) : (
        <RugbyBallIcon />
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
  const winnerName =
    predictionMargin === null || predictionMargin === 0
      ? ''
      : predictionMargin > 0
        ? teamAName
        : teamBName

  const headline =
    predictionMargin === null
      ? 'Prediction unavailable'
      : predictionMargin === 0
        ? 'Prediction Draw'
        : `Prediction ${winnerName} by`

  const marginText =
    predictionMargin === null
      ? '-'
      : predictionMargin === 0
        ? 'DRAW'
        : `${Math.abs(predictionMargin)}`

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
