'use client'

import type { ChangeEvent } from 'react'
import Link from 'next/link'
import { getCompetitionTeamLogoPath } from '@/lib/competition-team-logos'

export const MATCH_CARD_MARGIN_MAX = 50

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

function TeamPickCell({
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
      className={`flex min-h-[2.75rem] w-full min-w-0 max-w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 md:py-1.5 ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
          : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-400'
      } ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded text-xs font-bold ${
          selected ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-white text-slate-700 ring-1 ring-slate-200'
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
        <span className="block text-[9px] font-semibold uppercase tracking-wide opacity-80">{label}</span>
        <span className="block break-words text-xs font-bold leading-tight md:truncate" title={name}>
          {name}
        </span>
      </span>
    </button>
  )
}

export type MatchCardProps = {
  homeTeam: string
  awayTeam: string
  kickoffTime: string
  winner: 'home' | 'away' | null
  marginInput: string
  onSelectWinner: (side: 'home' | 'away') => void
  onMarginInputChange: (value: string) => void
  matchId: string
  signedIn?: boolean
  predictionsClosed?: boolean
  editable?: boolean
  predictionRowLocked?: boolean
  hasExistingSubmission?: boolean
  submitting?: boolean
  flashSubmitted?: boolean
  lockingPick?: boolean
  onSubmit?: () => void
  onLockPick?: () => void
  onRequireAuth?: () => void
  isAdmin?: boolean
  onAdminModel?: () => void
  /** When set, team crests resolve per competition (e.g. World Cup flags). */
  competitionSlug?: string
}

export default function MatchCard({
  homeTeam,
  awayTeam,
  kickoffTime,
  winner,
  marginInput,
  onSelectWinner,
  onMarginInputChange,
  matchId,
  signedIn = false,
  predictionsClosed = false,
  editable = true,
  predictionRowLocked = false,
  hasExistingSubmission = false,
  submitting = false,
  flashSubmitted = false,
  lockingPick = false,
  onSubmit,
  onLockPick,
  onRequireAuth,
  isAdmin = false,
  onAdminModel,
  competitionSlug,
}: MatchCardProps) {
  const homeLogo = getCompetitionTeamLogoPath(competitionSlug, homeTeam)
  const awayLogo = getCompetitionTeamLogoPath(competitionSlug, awayTeam)
  const homeSelected = winner === 'home'
  const awaySelected = winner === 'away'

  const disablePickers = predictionsClosed || predictionRowLocked || !editable
  const predictionMode = Boolean(onSubmit)

  const canSubmit =
    predictionMode &&
    signedIn &&
    editable &&
    !predictionRowLocked &&
    !predictionsClosed &&
    (homeSelected || awaySelected)

  function tapSide(side: 'home' | 'away') {
    if (disablePickers) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    onSelectWinner(side)
  }

  function onMarginChange(e: ChangeEvent<HTMLInputElement>) {
    if (disablePickers) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    onMarginInputChange(raw)
  }

  const saveLabel = hasExistingSubmission ? 'UPDATE' : 'SAVE'

  const rowShell = `rounded-lg border bg-white transition ${
    flashSubmitted ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'
  }`

  if (!predictionMode) {
    return null
  }

  return (
    <div className={`${rowShell} w-full max-w-full min-w-0`}>
      <div className="w-full min-w-0 md:overflow-x-auto">
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 px-2 py-2 md:min-w-[640px] md:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem_4.25rem_6.5rem] md:items-center">
          <div className="w-full min-w-0 border-b border-slate-100 pb-2 text-[10px] leading-tight text-slate-600 md:border-b-0 md:pb-0">
            {predictionsClosed ? (
              <span className="font-bold uppercase tracking-wide text-slate-500">Closed</span>
            ) : predictionRowLocked ? (
              <span className="font-bold uppercase tracking-wide text-amber-800">Locked</span>
            ) : (
              <span className="font-bold uppercase tracking-wide text-slate-500">Upcoming</span>
            )}
            <div className="mt-0.5 break-words font-medium text-slate-700">{formatKickoffShort(kickoffTime)}</div>
          </div>

          <TeamPickCell
            label="Home"
            name={homeTeam}
            logoSrc={homeLogo}
            selected={homeSelected}
            disabled={disablePickers}
            onSelect={() => tapSide('home')}
          />
          <TeamPickCell
            label="Away"
            name={awayTeam}
            logoSrc={awayLogo}
            selected={awaySelected}
            disabled={disablePickers}
            onSelect={() => tapSide('away')}
          />

          <div className="w-full min-w-0 md:w-auto md:shrink-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 md:hidden">Margin (pts)</p>
            <label className="sr-only" htmlFor={`margin-${matchId}`}>
              Margin
            </label>
            <input
              id={`margin-${matchId}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="-"
              disabled={disablePickers}
              value={marginInput}
              onChange={onMarginChange}
              onFocus={(e) => {
                if (!signedIn && !disablePickers) {
                  e.target.blur()
                  onRequireAuth?.()
                }
              }}
              onClick={() => {
                if (!signedIn && !disablePickers) onRequireAuth?.()
              }}
              className="w-full max-w-full rounded-md border border-slate-200 bg-white px-2 py-2.5 text-center text-sm font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50 md:px-1.5 md:py-2 md:text-xs"
            />
          </div>

          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 md:gap-1">
            {predictionsClosed ? (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold leading-tight text-slate-600 md:px-1 md:py-2"
                role="status"
              >
                Predictions closed
              </div>
            ) : !editable || predictionRowLocked ? (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold leading-tight text-slate-600 md:px-1 md:py-2"
                role="status"
              >
                {predictionRowLocked ? 'Locked in' : 'Predictions closed'}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!canSubmit || submitting}
                  onClick={() => {
                    if (!signedIn) {
                      onRequireAuth?.()
                      return
                    }
                    onSubmit?.()
                  }}
                  className="w-full rounded-md border border-slate-900 bg-slate-900 px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 md:w-auto md:px-2 md:py-2 md:text-[11px]"
                >
                  {submitting ? '…' : saveLabel}
                </button>
                {onLockPick ? (
                  <button
                    type="button"
                    disabled={lockingPick || submitting || predictionRowLocked}
                    onClick={() => onLockPick()}
                    className="w-full py-1 text-center text-xs font-semibold text-slate-500 underline decoration-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto md:text-[10px]"
                  >
                    {lockingPick ? 'Locking…' : 'Lock'}
                  </button>
                ) : null}
                {flashSubmitted ? (
                  <span className="text-center text-[9px] font-semibold text-emerald-700">Saved</span>
                ) : null}
              </>
            )}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch md:flex-col md:gap-1">
            {isAdmin && onAdminModel ? (
              <button
                type="button"
                onClick={() => onAdminModel()}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-slate-800 hover:bg-slate-100 sm:flex-1 md:w-full md:flex-none md:px-2 md:py-1.5 md:text-[10px]"
                title="View model prediction"
              >
                MODEL
              </button>
            ) : null}
            <Link
              href={`/predict-score/${matchId}`}
              className="w-full rounded-md border border-slate-300 bg-white py-2.5 text-center text-xs font-black uppercase tracking-wide text-slate-800 hover:bg-slate-50 sm:flex-1 md:w-full md:flex-none md:py-1.5 md:text-[10px]"
            >
              COMMENTS
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
