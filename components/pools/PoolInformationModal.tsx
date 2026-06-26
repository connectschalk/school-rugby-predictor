'use client'

import { useEffect, useId } from 'react'
import PoolLogo from '@/components/pools/PoolLogo'
import type { GameMatch } from '@/lib/public-prediction-game'
import type { PoolRow, PoolTeamRow } from '@/lib/pools'

function teamVs(m: GameMatch) {
  return `${m.home_team} vs ${m.away_team}`
}

function formatKickoff(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

type Props = {
  open: boolean
  onClose: () => void
  pool: PoolRow
  groups: { id: string; name: string }[]
  teams: PoolTeamRow[]
  matches: GameMatch[]
}

export default function PoolInformationModal({
  open,
  onClose,
  pool,
  groups,
  teams,
  matches,
}: Props) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const joinPolicy = pool.is_public
    ? 'Public pool — request to join; the pool admin approves new members.'
    : 'Private pool — join via invite link or pool code; the pool admin approves requests.'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <h2 id={titleId} className="text-lg font-black text-gray-900">
            Pool information
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Pool overview</h3>
            <div className="flex items-center gap-3">
              <PoolLogo logoUrl={pool.logo_url} name={pool.name} size="md" />
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900">{pool.name}</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  {pool.is_public ? 'Public pool' : 'Private pool'}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">{joinPolicy}</p>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Scoring</h3>
            <p className="text-sm leading-relaxed text-gray-700">
              Pool members are scored only on games included in this pool&apos;s fixture scope.
            </p>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Fixture scope</h3>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Included groups</p>
              {groups.length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">No groups selected.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <span
                      key={g.id}
                      className="max-w-full truncate rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700"
                      title={g.name}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pool teams</p>
              {teams.length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">No specific teams selected.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {teams.map((r) => (
                    <span
                      key={r.id}
                      className="max-w-full truncate rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800"
                      title={r.team_name}
                    >
                      {r.team_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-gray-500">
                When no groups are selected, prestige fixtures may be used as a fallback scope where configured.
              </p>
            ) : null}
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Weekly matches</h3>
            <p className="text-xs text-gray-500">Fixtures currently in this pool&apos;s effective scope.</p>
            {matches.length === 0 ? (
              <p className="text-sm text-gray-600">No matches currently listed for this pool.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {matches.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  >
                    <p className="font-semibold text-gray-900">{teamVs(m)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{formatKickoff(m.kickoff_time)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
