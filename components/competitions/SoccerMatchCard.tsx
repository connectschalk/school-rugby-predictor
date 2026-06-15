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

function TeamGoalsCell({
  label,
  name,
  competitionSlug,
  goalsInput,
  disabled,
  onGoalsChange,
  onRequireAuth,
  signedIn,
  inputId,
}: {
  label: string
  name: string
  competitionSlug?: string
  goalsInput: string
  disabled: boolean
  onGoalsChange: (value: string) => void
  onRequireAuth?: () => void
  signedIn: boolean
  inputId: string
}) {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (disabled) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    onGoalsChange(raw === '' ? '0' : String(Math.min(SOCCER_GOALS_MAX, Number.parseInt(raw, 10) || 0)))
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <CompetitionTeamLogo
          competitionSlug={competitionSlug}
          teamName={name}
          size={32}
          variant="badge"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="block truncate text-xs font-bold text-slate-900" title={name}>
            {name}
          </span>
        </span>
      </div>
      <label className="text-[10px] font-bold uppercase tracking-wide text-slate-600" htmlFor={inputId}>
        Goals
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        disabled={disabled}
        value={goalsInput}
        onChange={onChange}
        onFocus={(e) => {
          if (!signedIn && !disabled) {
            e.target.blur()
            onRequireAuth?.()
          }
        }}
        onClick={() => {
          if (!signedIn && !disabled) onRequireAuth?.()
        }}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-2.5 text-center text-sm font-bold tabular-nums text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
      />
    </div>
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
      <div className="grid w-full min-w-0 grid-cols-1 gap-3 px-3 py-3 md:grid-cols-[5.5rem_1fr_1fr_5.5rem] md:items-end">
        <div className="text-[10px] leading-tight text-slate-600">
          {predictionsClosed ? (
            <span className="font-bold uppercase tracking-wide text-slate-500">Closed</span>
          ) : predictionRowLocked ? (
            <span className="font-bold uppercase tracking-wide text-amber-800">Locked</span>
          ) : (
            <span className="font-bold uppercase tracking-wide text-slate-500">Upcoming</span>
          )}
          <div className="mt-0.5 font-medium text-slate-700">{formatKickoffShort(kickoffTime)}</div>
        </div>

        <TeamGoalsCell
          label="Home"
          name={homeTeam}
          competitionSlug={competitionSlug}
          goalsInput={homeGoalsInput}
          disabled={disablePickers}
          onGoalsChange={onHomeGoalsChange}
          onRequireAuth={onRequireAuth}
          signedIn={signedIn}
          inputId={`home-goals-${matchId}`}
        />
        <TeamGoalsCell
          label="Away"
          name={awayTeam}
          competitionSlug={competitionSlug}
          goalsInput={awayGoalsInput}
          disabled={disablePickers}
          onGoalsChange={onAwayGoalsChange}
          onRequireAuth={onRequireAuth}
          signedIn={signedIn}
          inputId={`away-goals-${matchId}`}
        />

        <div className="flex w-full flex-col items-stretch gap-2">
          {predictionsClosed ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold text-slate-600">
              Predictions closed
            </div>
          ) : !editable || predictionRowLocked ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold text-slate-600">
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
                className="w-full rounded-md border border-slate-900 bg-slate-900 px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? '…' : saveLabel}
              </button>
              {onLockPick ? (
                <button
                  type="button"
                  disabled={lockingPick || submitting || predictionRowLocked}
                  onClick={() => onLockPick()}
                  className="w-full py-1 text-center text-xs font-semibold text-slate-500 underline decoration-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
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
      </div>
    </div>
  )
}
