'use client'

import type { ChangeEvent } from 'react'
import CompetitionTeamLogo from '@/components/CompetitionTeamLogo'
import { SOCCER_GOALS_MAX } from '@/lib/predict-score-common'

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

function ScoreInput({
  value,
  disabled,
  inputId,
  signedIn,
  onChange,
  onRequireAuth,
  ariaLabel,
}: {
  value: string
  disabled: boolean
  inputId: string
  signedIn: boolean
  onChange: (value: string) => void
  onRequireAuth?: () => void
  ariaLabel: string
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (disabled) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    onChange(raw === '' ? '0' : String(Math.min(SOCCER_GOALS_MAX, Number.parseInt(raw, 10) || 0)))
  }

  return (
    <input
      id={inputId}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled}
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      onFocus={(e) => {
        if (!signedIn && !disabled) {
          e.target.blur()
          onRequireAuth?.()
        }
      }}
      onClick={() => {
        if (!signedIn && !disabled) onRequireAuth?.()
      }}
      className="h-11 w-12 rounded-lg border border-slate-200 bg-white text-center text-lg font-black tabular-nums text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50 sm:h-12 sm:w-14 sm:text-xl"
    />
  )
}

export type SoccerMatchCardProps = {
  homeTeam: string
  awayTeam: string
  kickoffTime: string
  homeGoalsInput: string
  awayGoalsInput: string
  onHomeGoalsChange: (value: string) => void
  onAwayGoalsChange: (value: string) => void
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
  competitionSlug?: string
}

export default function SoccerMatchCard({
  homeTeam,
  awayTeam,
  kickoffTime,
  homeGoalsInput,
  awayGoalsInput,
  onHomeGoalsChange,
  onAwayGoalsChange,
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
  competitionSlug,
}: SoccerMatchCardProps) {
  const disablePickers = predictionsClosed || predictionRowLocked || !editable
  const canSubmit =
    Boolean(onSubmit) &&
    signedIn &&
    editable &&
    !predictionRowLocked &&
    !predictionsClosed
  const saveLabel = hasExistingSubmission ? 'UPDATE' : 'SAVE'

  return (
    <div
      className={`rounded-lg border bg-white transition ${
        flashSubmitted ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'
      } w-full max-w-full min-w-0`}
    >
      <div className="space-y-3 px-3 py-3 md:grid md:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] md:items-center md:gap-3 md:space-y-0">
        <div className="text-[10px] leading-tight text-slate-600 md:self-start md:pt-1">
          {predictionsClosed ? (
            <span className="font-bold uppercase tracking-wide text-slate-500">Closed</span>
          ) : predictionRowLocked ? (
            <span className="font-bold uppercase tracking-wide text-amber-800">Locked</span>
          ) : (
            <span className="font-bold uppercase tracking-wide text-slate-500">Upcoming</span>
          )}
          <div className="mt-0.5 font-medium text-slate-700">{formatKickoffShort(kickoffTime)}</div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 sm:gap-x-3">
            <div className="flex min-w-0 max-w-full items-center gap-2 sm:max-w-[11rem]">
              <CompetitionTeamLogo
                competitionSlug={competitionSlug}
                teamName={homeTeam}
                size={36}
                variant="badge"
                className="border-0"
              />
              <span className="min-w-0 truncate text-sm font-bold text-slate-900" title={homeTeam}>
                {homeTeam}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <ScoreInput
                value={homeGoalsInput}
                disabled={disablePickers}
                inputId={`home-goals-${matchId}`}
                signedIn={signedIn}
                onChange={onHomeGoalsChange}
                onRequireAuth={onRequireAuth}
                ariaLabel={`${homeTeam} predicted score`}
              />
              <span className="px-0.5 text-lg font-black text-slate-400" aria-hidden>
                -
              </span>
              <ScoreInput
                value={awayGoalsInput}
                disabled={disablePickers}
                inputId={`away-goals-${matchId}`}
                signedIn={signedIn}
                onChange={onAwayGoalsChange}
                onRequireAuth={onRequireAuth}
                ariaLabel={`${awayTeam} predicted score`}
              />
            </div>

            <div className="flex min-w-0 max-w-full items-center gap-2 sm:max-w-[11rem]">
              <span className="min-w-0 truncate text-sm font-bold text-slate-900" title={awayTeam}>
                {awayTeam}
              </span>
              <CompetitionTeamLogo
                competitionSlug={competitionSlug}
                teamName={awayTeam}
                size={36}
                variant="badge"
                className="border-0"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {predictionsClosed ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-[10px] font-bold text-slate-600">
                Predictions closed
              </div>
            ) : !editable || predictionRowLocked ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-[10px] font-bold text-slate-600">
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
                  className="min-w-[6.5rem] rounded-md border border-slate-900 bg-slate-900 px-4 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? '…' : saveLabel}
                </button>
                {onLockPick ? (
                  <button
                    type="button"
                    disabled={lockingPick || submitting || predictionRowLocked}
                    onClick={() => onLockPick()}
                    className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {lockingPick ? 'Locking…' : 'Lock pick'}
                  </button>
                ) : null}
                {flashSubmitted ? (
                  <span className="text-[10px] font-semibold text-emerald-700">Saved</span>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="hidden md:block" aria-hidden />
      </div>
    </div>
  )
}
