'use client'

import type { ChangeEvent } from 'react'
import Link from 'next/link'
import CompetitionTeamLogo from '@/components/CompetitionTeamLogo'
import { getMobileTeamName } from '@/lib/soccer-mobile-team-name'
import { formatSoccerLockedPredictionLabel } from '@/lib/soccer-penalty-display'
import type { SoccerPenaltySide } from '@/lib/soccer-exact-score-scoring'
import { parseSoccerGoalsFromInput, SOCCER_GOALS_MAX } from '@/lib/predict-score-common'
import { PREDICTION_KICKOFF_LOCK_MESSAGE } from '@/lib/prediction-cutoff'

/** Desktop predict table header row (matches SoccerMatchCard columns). */
export const SOCCER_PREDICT_HEADER_GRID =
  'grid min-w-[640px] grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4.25rem_6.5rem] items-center gap-2'

/** Desktop predict table columns: kickoff · home · score · away · save · admin */
export const SOCCER_PREDICT_TABLE_GRID =
  'md:min-w-[640px] md:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4.25rem_6.5rem]'

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
  compact = false,
  allowBlank = false,
}: {
  value: string
  disabled: boolean
  inputId: string
  signedIn: boolean
  onChange: (value: string) => void
  onRequireAuth?: () => void
  ariaLabel: string
  compact?: boolean
  allowBlank?: boolean
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (disabled) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (allowBlank && raw === '') {
      onChange('')
      return
    }
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
      placeholder={allowBlank && value === '' ? '—' : undefined}
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
      className={
        compact
          ? 'h-12 w-14 shrink-0 rounded-md border border-slate-200 bg-white text-center text-base font-black tabular-nums text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50'
          : 'h-11 w-12 rounded-lg border border-slate-200 bg-white text-center text-lg font-black tabular-nums text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50 sm:h-12 sm:w-14 sm:text-xl'
      }
    />
  )
}

function TeamCell({
  label,
  name,
  competitionSlug,
  align = 'left',
  compact = false,
}: {
  label: string
  name: string
  competitionSlug?: string
  align?: 'left' | 'right'
  /** Narrow mobile matchup row: flag + name only, vertically centered with score. */
  compact?: boolean
}) {
  if (compact) {
    const displayName = getMobileTeamName(name)
    if (align === 'right') {
      return (
        <div className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span
            className="min-w-0 truncate text-sm font-bold leading-tight text-slate-900"
            title={name}
            aria-label={`${label}: ${name}`}
          >
            {displayName}
          </span>
          <CompetitionTeamLogo
            competitionSlug={competitionSlug}
            teamName={name}
            size={28}
            variant="badge"
            className="h-7 w-7 shrink-0 border-0"
          />
        </div>
      )
    }

    return (
      <div className="flex min-w-0 items-center gap-2 text-left">
        <CompetitionTeamLogo
          competitionSlug={competitionSlug}
          teamName={name}
          size={28}
          variant="badge"
          className="h-7 w-7 shrink-0 border-0"
        />
        <span
          className="min-w-0 truncate text-sm font-bold leading-tight text-slate-900"
          title={name}
          aria-label={`${label}: ${name}`}
        >
          {displayName}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}
    >
      <CompetitionTeamLogo
        competitionSlug={competitionSlug}
        teamName={name}
        size={32}
        variant="badge"
        className="shrink-0 border-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block truncate text-xs font-bold text-slate-900" title={name}>
          {name}
        </span>
      </span>
    </div>
  )
}

function ScoreRow({
  homeTeam,
  awayTeam,
  homeGoalsInput,
  awayGoalsInput,
  disablePickers,
  matchId,
  signedIn,
  onHomeGoalsChange,
  onAwayGoalsChange,
  onRequireAuth,
  showBlankScores,
}: {
  homeTeam: string
  awayTeam: string
  homeGoalsInput: string
  awayGoalsInput: string
  disablePickers: boolean
  matchId: string
  signedIn: boolean
  onHomeGoalsChange: (value: string) => void
  onAwayGoalsChange: (value: string) => void
  onRequireAuth?: () => void
  showBlankScores: boolean
}) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-center gap-1.5">
      <ScoreInput
        value={homeGoalsInput}
        disabled={disablePickers}
        inputId={`home-goals-${matchId}`}
        signedIn={signedIn}
        onChange={onHomeGoalsChange}
        onRequireAuth={onRequireAuth}
        ariaLabel={`${homeTeam} predicted score`}
        compact
        allowBlank={showBlankScores}
      />
      <span className="text-sm font-black text-slate-400" aria-hidden>
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
        compact
        allowBlank={showBlankScores}
      />
    </div>
  )
}

function PenaltyWinnerPicker({
  homeTeam,
  awayTeam,
  value,
  disabled,
  name,
  signedIn,
  onChange,
  onRequireAuth,
}: {
  homeTeam: string
  awayTeam: string
  value: SoccerPenaltySide | null | undefined
  disabled: boolean
  name: string
  signedIn: boolean
  onChange: (side: SoccerPenaltySide) => void
  onRequireAuth?: () => void
}) {
  function handlePick(side: SoccerPenaltySide) {
    if (disabled) return
    if (!signedIn) {
      onRequireAuth?.()
      return
    }
    onChange(side)
  }

  return (
    <fieldset className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 md:col-span-full">
      <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        Penalties
      </legend>
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800">
          <input
            type="radio"
            name={name}
            value="home"
            disabled={disabled}
            checked={value === 'home'}
            onChange={() => handlePick('home')}
          />
          {homeTeam} wins on penalties
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800">
          <input
            type="radio"
            name={name}
            value="away"
            disabled={disabled}
            checked={value === 'away'}
            onChange={() => handlePick('away')}
          />
          {awayTeam} wins on penalties
        </label>
      </div>
    </fieldset>
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
  isKnockoutFixture?: boolean
  penaltyWinner?: SoccerPenaltySide | null
  onPenaltyWinnerChange?: (side: SoccerPenaltySide) => void
  lockedPenaltyWinner?: SoccerPenaltySide | null
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
  isKnockoutFixture = false,
  penaltyWinner = null,
  onPenaltyWinnerChange,
  lockedPenaltyWinner = null,
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
  const showBlankScores = predictionsClosed && !hasExistingSubmission
  const canSubmit =
    Boolean(onSubmit) &&
    signedIn &&
    editable &&
    !predictionRowLocked &&
    !predictionsClosed
  const saveLabel = hasExistingSubmission ? 'UPDATE' : 'SAVE'
  const drawScores =
    parseSoccerGoalsFromInput(homeGoalsInput) === parseSoccerGoalsFromInput(awayGoalsInput) &&
    parseSoccerGoalsFromInput(homeGoalsInput) !== null
  const showPenaltyPicker =
    isKnockoutFixture && drawScores && Boolean(onPenaltyWinnerChange) && !predictionsClosed
  const displayPenaltyWinner = lockedPenaltyWinner ?? (predictionRowLocked ? penaltyWinner : null)
  const savedScoreLabel =
    hasExistingSubmission && (predictionsClosed || predictionRowLocked || !editable)
      ? formatSoccerLockedPredictionLabel(
          homeGoalsInput,
          awayGoalsInput,
          displayPenaltyWinner,
          homeTeam,
          awayTeam
        )
      : null

  const saveColumn = predictionsClosed ? (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold leading-tight text-slate-600 md:px-1 md:py-2"
      role="status"
    >
      {savedScoreLabel ? (
        <>
          <span className="block">{PREDICTION_KICKOFF_LOCK_MESSAGE}</span>
          <span className="mt-1 block text-xs font-black tabular-nums text-slate-900">{savedScoreLabel}</span>
        </>
      ) : (
        PREDICTION_KICKOFF_LOCK_MESSAGE
      )}
    </div>
  ) : !editable || predictionRowLocked ? (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-[10px] font-bold leading-tight text-slate-600 md:px-1 md:py-2"
      role="status"
    >
      {predictionRowLocked && savedScoreLabel ? (
        <>
          <span className="block">Locked in</span>
          <span className="mt-1 block text-xs font-black text-slate-900">{savedScoreLabel}</span>
        </>
      ) : predictionRowLocked ? (
        'Locked in'
      ) : (
        'Predictions closed'
      )}
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
        className="w-full rounded-md border border-slate-900 bg-slate-900 px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 md:px-2 md:py-2 md:text-[11px]"
      >
        {submitting ? '…' : saveLabel}
      </button>
      {onLockPick ? (
        <button
          type="button"
          disabled={lockingPick || submitting || predictionRowLocked}
          onClick={() => onLockPick()}
          className="w-full py-1 text-center text-xs font-semibold text-slate-500 underline decoration-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 md:text-[10px]"
        >
          {lockingPick ? 'Locking…' : 'Lock'}
        </button>
      ) : null}
      {flashSubmitted ? (
        <span className="text-center text-[9px] font-semibold text-emerald-700">Saved</span>
      ) : null}
    </>
  )

  return (
    <div
      className={`rounded-lg border bg-white transition ${
        flashSubmitted ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'
      } w-full max-w-full min-w-0`}
    >
      <div className="w-full min-w-0 md:overflow-x-auto">
        <div
          className={`grid w-full min-w-0 grid-cols-1 gap-2 px-2 py-2 ${SOCCER_PREDICT_TABLE_GRID} md:items-center`}
        >
          <div className="w-full min-w-0 border-b border-slate-100 pb-2 text-[10px] leading-tight text-slate-600 md:border-b-0 md:pb-0">
            {predictionsClosed ? (
              <span className="font-bold uppercase tracking-wide text-slate-500">Locked</span>
            ) : predictionRowLocked ? (
              <span className="font-bold uppercase tracking-wide text-amber-800">Locked</span>
            ) : (
              <span className="font-bold uppercase tracking-wide text-slate-500">Upcoming</span>
            )}
            <div className="mt-0.5 break-words font-medium text-slate-700">{formatKickoffShort(kickoffTime)}</div>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:contents">
            <div className="min-w-0 justify-self-stretch md:justify-self-start">
              <div className="md:hidden">
                <TeamCell label="Home" name={homeTeam} competitionSlug={competitionSlug} compact />
              </div>
              <div className="hidden md:block">
                <TeamCell label="Home" name={homeTeam} competitionSlug={competitionSlug} />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center">
              <ScoreRow
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeGoalsInput={homeGoalsInput}
                awayGoalsInput={awayGoalsInput}
                disablePickers={disablePickers}
                matchId={matchId}
                signedIn={signedIn}
                onHomeGoalsChange={onHomeGoalsChange}
                onAwayGoalsChange={onAwayGoalsChange}
                onRequireAuth={onRequireAuth}
                showBlankScores={showBlankScores}
              />
            </div>

            <div className="min-w-0 justify-self-stretch md:justify-self-end">
              <div className="md:hidden">
                <TeamCell
                  label="Away"
                  name={awayTeam}
                  competitionSlug={competitionSlug}
                  align="right"
                  compact
                />
              </div>
              <div className="hidden md:block">
                <TeamCell label="Away" name={awayTeam} competitionSlug={competitionSlug} align="right" />
              </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 md:gap-1">{saveColumn}</div>

          {showPenaltyPicker ? (
            <PenaltyWinnerPicker
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              value={penaltyWinner}
              disabled={disablePickers}
              name={`penalty-winner-${matchId}`}
              signedIn={signedIn}
              onChange={(side) => onPenaltyWinnerChange?.(side)}
              onRequireAuth={onRequireAuth}
            />
          ) : null}

          <div className="flex w-full min-w-0 flex-col gap-2 md:gap-1">
            <Link
              href={`/predict-score/${matchId}`}
              className="w-full rounded-md border border-slate-300 bg-white py-2.5 text-center text-xs font-black uppercase tracking-wide text-slate-800 hover:bg-slate-50 md:py-1.5 md:text-[10px]"
            >
              Comments
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
