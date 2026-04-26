'use client'

import { useEffect, useId } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  /** Dialog title; defaults to “How it works”. */
  title?: string
}

/**
 * Shared Predict a Score + rankings explainer (modal shell + one canonical body).
 */
export default function HowItWorksModal({ open, onClose, title = 'How it works' }: Props) {
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-gray-900 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <h2 id={titleId} className="text-left text-lg font-bold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 text-left text-sm leading-relaxed text-gray-800">
          <ul className="list-disc space-y-2.5 pl-5 marker:text-gray-900">
            <li>You can predict one match or many. You do not have to predict every fixture.</li>
            <li>Select the team you think will win.</li>
            <li>Enter the winning margin.</li>
            <li>
              Submit one row with the row button, or use <strong>Submit all</strong> to send every
              row that already has both a winner and a margin filled (incomplete rows are skipped).
            </li>
            <li>Correct winner = 2 points.</li>
            <li>
              Margin points:
              <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
                <li>Exact margin = 5</li>
                <li>1 point out = 4</li>
                <li>2 points out = 3</li>
                <li>3 points out = 2</li>
                <li>4 points out = 1</li>
                <li>5+ out = 0</li>
              </ul>
            </li>
            <li>Maximum score per match = 7 points.</li>
            <li>Points ranking is based on total points.</li>
            <li>
              Margin Total ranks users by margin points only, excluding winner points.
            </li>
            <li>Margin Average is margin points divided by predictions made.</li>
            <li>All ranking shows everyone.</li>
            <li>Top 20 category rankings require 10 or more predictions.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
