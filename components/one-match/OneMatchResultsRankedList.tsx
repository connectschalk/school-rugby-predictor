'use client'

import {
  distinctMarginErrorsForMedals,
  medalTierForMarginError,
  type RankedPrediction,
  type ResultsMedalTier,
} from '@/lib/one-match-challenge'

type MatchLike = {
  home_team: string
  away_team: string
}

type OneMatchResultsRankedListProps = {
  match: MatchLike
  ranked: RankedPrediction[]
  myBrowserToken: string
}

function winnerLabel(m: MatchLike, side: 'home' | 'away') {
  return side === 'home' ? m.home_team : m.away_team
}

const MEDAL_EMOJI: Record<Exclude<ResultsMedalTier, null>, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
}

function tierRowClasses(tier: ResultsMedalTier): string {
  switch (tier) {
    case 'gold':
      return 'border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/50 to-white shadow-sm'
    case 'silver':
      return 'border-slate-200/90 bg-gradient-to-r from-slate-100 via-slate-50 to-white shadow-sm'
    case 'bronze':
      return 'border-orange-200/75 bg-gradient-to-r from-orange-50 via-amber-50/30 to-white shadow-sm'
    default:
      return 'border-gray-100 bg-white shadow-sm'
  }
}

export function OneMatchResultsRankedList({ match, ranked, myBrowserToken }: OneMatchResultsRankedListProps) {
  const errorTiers = distinctMarginErrorsForMedals(ranked)
  const anyCorrect = ranked.some((r) => r.correct)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      {!anyCorrect ? (
        <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-center text-sm text-amber-950">
          No one picked the winning team.
        </p>
      ) : null}

      {ranked.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No locked predictions to show yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ranked.map((r) => {
            const tier = medalTierForMarginError(r.marginError, r.correct, errorTiers)
            const isMe = r.browser_token === myBrowserToken
            const pickLine = `${winnerLabel(match, r.predicted_winner)} by ${r.predicted_margin}`

            return (
              <li
                key={r.id}
                className={`flex min-w-0 items-stretch gap-2.5 rounded-xl border px-3 py-3.5 sm:gap-3 sm:px-4 ${tierRowClasses(tier)} ${
                  isMe ? 'ring-2 ring-red-500/25 ring-offset-1 ring-offset-white' : ''
                }`}
              >
                <div className="flex w-9 shrink-0 flex-col items-center justify-start pt-0.5 text-lg leading-none sm:w-10">
                  {tier ? (
                    <span aria-hidden>{MEDAL_EMOJI[tier]}</span>
                  ) : (
                    <span className="invisible select-none" aria-hidden>
                      🥇
                    </span>
                  )}
                </div>
                <div className="flex w-7 shrink-0 justify-end pt-0.5 sm:w-8">
                  <span className="text-sm font-bold tabular-nums text-gray-800 sm:text-base">{r.rank}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 sm:text-base">{r.display_name}</p>
                  <p className="mt-0.5 text-xs leading-snug text-gray-500 sm:text-sm">
                    {pickLine}
                    {!r.correct ? <span className="ml-1 font-medium text-gray-400">(wrong winner)</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center pl-1 text-right">
                  <span className="whitespace-nowrap text-sm font-bold tabular-nums text-gray-900 sm:text-base">
                    by {r.predicted_margin}
                  </span>
                </div>
            </li>
          )
        })}
        </ul>
      )}

      {ranked.length > 0 ? (
        <p className="mt-4 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500 sm:text-sm">
          Predictions are ranked by closest margin to the actual result. Matching predictions share the same medal and
          rank.
        </p>
      ) : null}
    </div>
  )
}
