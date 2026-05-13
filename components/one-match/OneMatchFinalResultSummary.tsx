import type { FinalGameResultSummary } from '@/lib/one-match-challenge'

type Props = {
  summary: FinalGameResultSummary
  /** Tighter top spacing when stacked directly under the “Predictions closed” banner */
  tightTop?: boolean
}

export function OneMatchFinalResultSummary({ summary, tightTop }: Props) {
  const top = tightTop ? 'mt-3' : 'mt-5'

  return (
    <div className={`${top} border-t border-gray-100/90 pt-3 text-center`}>
      {summary.kind === 'draw' ? (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Final result</p>
          <p className="mt-1.5 px-1 text-sm font-bold leading-snug text-gray-900 sm:text-base">Match drawn</p>
        </>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Final game margin</p>
          <p className="mt-1.5 px-1 text-sm leading-snug text-gray-900 sm:text-base">
            <span className="font-bold break-words">{summary.teamName}</span>
            <span className="font-medium text-gray-500"> by </span>
            <span className="font-bold tabular-nums text-gray-900">{summary.margin}</span>
          </p>
        </>
      )}
    </div>
  )
}
