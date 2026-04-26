'use client'

import PredictionSlipRow, { type SlipPick } from '@/components/predict-score/PredictionSlipRow'
import type { GameMatch, UserPredictionRow } from '@/lib/public-prediction-game'

const HEADER_GRID =
  'mt-0 hidden border-b border-gray-200 bg-gray-900 px-3 py-2 md:grid md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_6.5rem_5.5rem] md:items-center md:gap-3 md:text-[10px] md:font-bold md:uppercase md:tracking-wider md:text-white'

/** Table header row classes for “Predictions closed” lists (gray bar). */
export const CLOSED_SLIP_HEADER_CLASS =
  'mt-0 hidden border-b border-gray-300 bg-gray-600 px-3 py-2 md:grid md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_6.5rem_5.5rem] md:items-center md:gap-3 md:text-[10px] md:font-bold md:uppercase md:tracking-wider md:text-white'

type Props = {
  title: string
  titleClassName: string
  sectionClassName?: string
  description?: string
  listWrapClassName?: string
  headerClassName?: string
  matches: GameMatch[]
  startsSoonIds: Set<string>
  slipByMatch: Record<string, SlipPick>
  predictions: Map<string, UserPredictionRow>
  signedIn: boolean
  submittingMatchId: string | null
  submittingAll: boolean
  flashSubmittedId: string | null
  patchSlip: (matchId: string, patch: Partial<SlipPick>) => void
  onPredict: (matchId: string) => void
}

export default function PredictScoreSlipListSection({
  title,
  titleClassName,
  sectionClassName = '',
  description,
  listWrapClassName = 'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm shadow-black/5',
  headerClassName = HEADER_GRID,
  matches,
  startsSoonIds,
  slipByMatch,
  predictions,
  signedIn,
  submittingMatchId,
  submittingAll,
  flashSubmittedId,
  patchSlip,
  onPredict,
}: Props) {
  if (matches.length === 0) return null

  return (
    <div className={sectionClassName || undefined}>
      <div className={titleClassName}>{title}</div>
      {description ? <p className="mt-2 max-w-2xl text-sm text-gray-600">{description}</p> : null}
      <div className={listWrapClassName}>
        <div className={headerClassName}>
          <span>Kick-off</span>
          <span>Home</span>
          <span>Away</span>
          <span className="text-center">Margin</span>
          <span className="text-center">Predict</span>
          <span className="text-center">Comments</span>
        </div>
        <ul className="space-y-3 bg-gray-100/70 p-2 md:space-y-0 md:divide-y md:divide-gray-100 md:bg-white md:p-0">
          {matches.map((match) => {
            const slip = slipByMatch[match.id] ?? { winner: null, margin: '' }
            const rowBusy = submittingMatchId === match.id || submittingAll
            return (
              <PredictionSlipRow
                key={match.id}
                match={match}
                slip={slip}
                onSlipChange={patchSlip}
                prediction={predictions.get(match.id)}
                signedIn={signedIn}
                startsSoon={startsSoonIds.has(match.id)}
                submitting={rowBusy}
                flashSubmitted={flashSubmittedId === match.id}
                onPredict={onPredict}
              />
            )
          })}
        </ul>
      </div>
    </div>
  )
}
