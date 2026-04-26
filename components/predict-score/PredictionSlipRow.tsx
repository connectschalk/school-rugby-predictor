'use client'

import Link from 'next/link'
import type { GameMatch, UserPredictionRow } from '@/lib/public-prediction-game'
import {
  canEditPredictionOnMatch,
  formatKickoffHm,
  matchPredictionsClosed,
  predictionCutoffPassed,
} from '@/lib/prediction-cutoff'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'

export type SlipPick = {
  winner: 'home' | 'away' | null
  margin: string
}

type Props = {
  match: GameMatch
  slip: SlipPick
  onSlipChange: (matchId: string, patch: Partial<SlipPick>) => void
  prediction: UserPredictionRow | undefined
  signedIn: boolean
  /** Kickoff within 60 minutes but still before kickoff — show warning, keep Predict enabled. */
  startsSoon?: boolean
  submitting: boolean
  flashSubmitted: boolean
  onPredict: (matchId: string) => void
}

function formatKickoffShort(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function TeamLogoBlock({
  label,
  name,
  logoSrc,
  selected,
  disabled,
  onSelect,
}: {
  label: string
  name: string
  logoSrc: string | null
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-[3.25rem] w-full items-center gap-2 border-2 px-3 py-2 text-left transition ${
        selected
          ? 'border-teal-950 bg-teal-800 text-white'
          : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-gray-300'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md text-sm font-bold ${
          selected ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-teal-100 text-teal-900'
        }`}
      >
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {label}
        </span>
        <span className="block truncate text-sm font-semibold leading-tight">{name}</span>
      </span>
    </button>
  )
}

export default function PredictionSlipRow({
  match,
  slip,
  onSlipChange,
  prediction,
  signedIn,
  startsSoon = false,
  submitting,
  flashSubmitted,
  onPredict,
}: Props) {
  const at = new Date()
  const cutoffPassed = predictionCutoffPassed(match, at)
  const closed = matchPredictionsClosed(match, at)
  const lockedOut = !canEditPredictionOnMatch(match, at)
  const editable = signedIn && !lockedOut
  const winner = lockedOut && prediction ? prediction.predicted_winner : slip.winner
  const marginVal = lockedOut && prediction ? String(prediction.predicted_margin) : slip.margin
  const kickHm = formatKickoffHm(match.kickoff_time)

  const homeSelected = winner === 'home'
  const awaySelected = winner === 'away'
  const homeLogo = getSchoolTeamLogoPath(match.home_team)
  const awayLogo = getSchoolTeamLogoPath(match.away_team)

  return (
    <li className="list-none">
      {/* Mobile slip card */}
      <div className="border border-gray-300 bg-white p-4 shadow-sm md:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-900">
            {match.status === 'locked' ? 'Locked' : cutoffPassed ? 'Closed' : 'Upcoming'}
          </span>
          <span className="text-xs text-gray-500">{formatKickoffShort(match.kickoff_time)}</span>
        </div>
        {!closed ? (
          <div className="mt-1 space-y-0.5 text-center text-[11px] font-medium text-gray-600">
            <p>Predictions close at kickoff</p>
            {kickHm ? <p>Kickoff: {kickHm}</p> : null}
          </div>
        ) : (
          <p className="mt-1 text-center text-[11px] font-semibold text-gray-600">Predictions closed</p>
        )}
        {startsSoon && editable ? (
          <div
            className="mt-2 flex items-center justify-center gap-1.5 rounded border border-amber-600 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-950"
            role="status"
          >
            <span className="text-base font-black leading-none" aria-hidden>
              !
            </span>
            <span>Starts soon</span>
            {kickHm ? <span className="font-normal text-gray-700">· Kickoff: {kickHm}</span> : null}
          </div>
        ) : null}
        <p className="mt-3 text-center text-xs font-medium text-gray-500">Tap a school to pick winner</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TeamLogoBlock
            label="Home"
            name={match.home_team}
            logoSrc={homeLogo}
            selected={homeSelected}
            disabled={!editable}
            onSelect={() => onSlipChange(match.id, { winner: 'home' })}
          />
          <TeamLogoBlock
            label="Away"
            name={match.away_team}
            logoSrc={awayLogo}
            selected={awaySelected}
            disabled={!editable}
            onSelect={() => onSlipChange(match.id, { winner: 'away' })}
          />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-600">
            Margin (pts)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            disabled={!editable}
            value={marginVal}
            onChange={(e) => onSlipChange(match.id, { margin: e.target.value })}
            className="w-full border-2 border-gray-200 bg-white px-3 py-2.5 text-center text-base font-semibold tabular-nums outline-none focus:border-teal-800 disabled:bg-gray-50"
            placeholder="—"
          />
        </div>
        {lockedOut && signedIn && prediction ? (
          <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs text-gray-800">
            Saved:{' '}
            <span className="font-semibold">
              {prediction.predicted_winner === 'home' ? match.home_team : match.away_team}
            </span>{' '}
            by {prediction.predicted_margin}
          </p>
        ) : lockedOut && signedIn && !prediction ? (
          <p className="mt-3 text-center text-xs text-gray-600">
            {cutoffPassed ? 'No prediction saved before close.' : 'No prediction saved before lock.'}
          </p>
        ) : null}
        {!signedIn ? (
          <p className="mt-3 text-center text-xs text-gray-600">Sign in above to predict.</p>
        ) : null}
        {flashSubmitted ? (
          <p className="mt-2 text-center text-xs font-semibold text-teal-800">Saved</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={!editable || submitting}
            onClick={() => onPredict(match.id)}
            className="flex-1 border-2 border-teal-900 bg-teal-800 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-teal-900 disabled:opacity-40"
          >
            {submitting ? '…' : !editable && signedIn && lockedOut ? 'Closed' : prediction ? 'Update' : 'Predict'}
          </button>
          <Link
            href={`/predict-score/${match.id}`}
            className="flex items-center justify-center border-2 border-gray-300 bg-white px-4 py-3 text-center text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            Comments
          </Link>
        </div>
      </div>

      {/* Desktop slip row */}
      <div className="hidden border-b border-gray-200 bg-white md:grid md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)_5.5rem_6.5rem_5.5rem] md:items-center md:gap-3 md:px-3 md:py-2">
        <div className="text-xs text-gray-600">
          <div className="font-bold uppercase tracking-wide text-teal-900">
            {match.status === 'locked' ? 'Locked' : cutoffPassed ? 'Closed' : 'Upcoming'}
          </div>
          <div className="mt-0.5 leading-snug">{formatKickoffShort(match.kickoff_time)}</div>
          {!closed ? (
            <div className="mt-1 space-y-0.5 text-[10px] font-medium leading-tight text-gray-600">
              <div>Predictions close at kickoff</div>
              {kickHm ? <div>Kickoff: {kickHm}</div> : null}
            </div>
          ) : (
            <div className="mt-1 text-[10px] font-semibold text-gray-600">Predictions closed</div>
          )}
          {startsSoon && editable ? (
            <div
              className="mt-1.5 flex flex-wrap items-center gap-1 rounded border border-amber-600 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-950"
              role="status"
            >
              <span className="font-black" aria-hidden>
                !
              </span>
              <span>Starts soon</span>
              {kickHm ? <span className="font-normal text-gray-700">· {kickHm}</span> : null}
            </div>
          ) : null}
        </div>
        <TeamLogoBlock
          label="Home"
          name={match.home_team}
          logoSrc={homeLogo}
          selected={homeSelected}
          disabled={!editable}
          onSelect={() => onSlipChange(match.id, { winner: 'home' })}
        />
        <TeamLogoBlock
          label="Away"
          name={match.away_team}
          logoSrc={awayLogo}
          selected={awaySelected}
          disabled={!editable}
          onSelect={() => onSlipChange(match.id, { winner: 'away' })}
        />
        <div>
          <label className="sr-only" htmlFor={`m-${match.id}`}>
            Margin
          </label>
          <input
            id={`m-${match.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            disabled={!editable}
            value={marginVal}
            onChange={(e) => onSlipChange(match.id, { margin: e.target.value })}
            className="w-full border-2 border-gray-200 px-2 py-2.5 text-center text-sm font-semibold tabular-nums outline-none focus:border-teal-800 disabled:bg-gray-50"
            placeholder="—"
          />
        </div>
        <div className="flex flex-col items-stretch gap-1">
          <button
            type="button"
            disabled={!editable || submitting}
            onClick={() => onPredict(match.id)}
            className="border-2 border-teal-900 bg-teal-800 px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-teal-900 disabled:opacity-40"
          >
            {submitting ? '…' : !editable && signedIn && lockedOut ? 'Closed' : prediction ? 'Save' : 'Predict'}
          </button>
          {flashSubmitted ? (
            <span className="text-center text-[10px] font-semibold text-teal-800">Saved</span>
          ) : null}
        </div>
        <Link
          href={`/predict-score/${match.id}`}
          className="border-2 border-gray-300 bg-gray-50 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-gray-800 hover:bg-gray-100"
        >
          Comments
        </Link>
      </div>
    </li>
  )
}
