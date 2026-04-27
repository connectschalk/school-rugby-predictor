'use client'

import Link from 'next/link'
import { useEffect, useId } from 'react'

type Props = {
  open: boolean
  onClose: () => void
}

export default function PredictScoreAuthModal({ open, onClose }: Props) {
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
        className="w-full max-w-sm rounded-2xl border-2 border-gray-900 bg-white p-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-center text-base font-bold text-gray-900">
          Log in to save your prediction
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-gray-600">
          Create an account or log in to make picks, lock predictions, and climb the rankings.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-700 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            Sign up
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Close
        </button>
      </div>
    </div>
  )
}
