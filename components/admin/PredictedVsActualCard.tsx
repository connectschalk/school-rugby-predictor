'use client'

import { TeamLogoCircle } from '@/components/admin/PredictionCard'

type PredictedVsActualCardProps = {
  teamAName: string
  teamBName: string
  predictedText: string
  actualText: string
  differenceText: string
  date: string
}

export default function PredictedVsActualCard({
  teamAName,
  teamBName,
  predictedText,
  actualText,
  differenceText,
  date,
}: PredictedVsActualCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-[500px] flex-col items-center rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
      <img
        src="/nextplay-predictor.png"
        alt="NextPlay Predictor"
        className="h-14 w-auto"
      />

      <p className="mt-6 text-xs uppercase tracking-[0.18em] text-gray-500">
        Predicted vs Actual
      </p>

      <div className="mt-6 flex w-full items-center justify-center gap-6 md:gap-10">
        <div className="flex min-w-0 flex-col items-center">
          <TeamLogoCircle
            teamName={teamAName}
            sizeClassName="h-28 w-28 md:h-32 md:w-32"
            imageSizeClassName="h-[84%] w-[84%]"
          />
          <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
            {teamAName || 'Team A'}
          </p>
        </div>

        <div className="pt-3 text-3xl font-bold text-gray-800 md:text-4xl">VS</div>

        <div className="flex min-w-0 flex-col items-center">
          <TeamLogoCircle
            teamName={teamBName}
            sizeClassName="h-28 w-28 md:h-32 md:w-32"
            imageSizeClassName="h-[84%] w-[84%]"
          />
          <p className="mt-3 max-w-[150px] text-sm font-semibold text-gray-900 md:text-base">
            {teamBName || 'Team B'}
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
