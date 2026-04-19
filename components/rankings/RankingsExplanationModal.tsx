'use client'

import { useEffect } from 'react'

type RankingsExplanationModalProps = {
  open: boolean
  onClose: () => void
}

export default function RankingsExplanationModal({
  open,
  onClose,
}: RankingsExplanationModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankings-explanation-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg px-2 py-1 text-2xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Close"
        >
          ×
        </button>

        <h2 id="rankings-explanation-title" className="pr-10 text-xl font-semibold text-gray-900">
          How connected pool rankings work
        </h2>

        <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            Teams are ranked <strong className="font-medium text-gray-900">only inside connected pools</strong>{' '}
            — groups of schools that are linked through actual match results.
          </li>
          <li>
            A <strong className="font-medium text-gray-900">pool</strong> is formed when teams are connected by
            those results (like a network). If a new match links two pools,{' '}
            <strong className="font-medium text-gray-900">they merge automatically</strong>.
          </li>
          <li>
            Rankings use <strong className="font-medium text-gray-900">real score margins</strong> from matches
            within that connected network — not guesses or fixtures outside it.
          </li>
          <li>
            <strong className="font-medium text-gray-900">Relative Score</strong> shows where a team sits
            compared to others in the <em>same</em> pool.
          </li>
          <li>
            Wins and losses matter, but <strong className="font-medium text-gray-900">margins and how results
            connect</strong> shape the order — big wins help, but only through games that tie teams into this
            network.
          </li>
          <li>
            Teams are <strong className="font-medium text-gray-900">not compared</strong> to schools outside
            their pool until a result (or chain of results) connects those pools.
          </li>
        </ul>

        <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <strong className="font-medium text-gray-900">Note:</strong> As more matches are played, rankings
          usually become more stable because the network of linked results grows stronger.
        </p>
      </div>
    </div>
  )
}
