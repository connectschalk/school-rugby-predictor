'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { MemoryMap } from '@/lib/memory-map/types'
import MemoryMapThemedRoot from '@/components/memory-map/MemoryMapThemedRoot'
import {
  mmPrimaryButtonStyle,
  mmStepCircleStyle,
  resolvePublicMemoryMapTheme,
} from '@/lib/memory-map/theme'

const STORAGE_PREFIX = 'mm_onboarding_dismissed_'

type Props = {
  mapSlug: string
  map: MemoryMap
}

export default function MapOnboardingOverlay({ mapSlug, map }: Props) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const theme = resolvePublicMemoryMapTheme(map)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(`${STORAGE_PREFIX}${mapSlug}`)
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [mapSlug])

  function dismiss() {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${mapSlug}`, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  if (!visible || !mounted) return null

  return createPortal(
    <MemoryMapThemedRoot map={map}>
      <div className="fixed inset-0 z-[60] bg-black/70">
        <div className="fixed inset-x-0 bottom-0 z-[61] box-border px-4 mm-modal-bottom-pad md:inset-0 md:flex md:items-center md:justify-center md:p-6 md:pb-6">
          <div
            className="mm-card mx-auto w-full max-w-md rounded-2xl p-6 shadow-xl"
            style={{ borderColor: `color-mix(in oklab, ${theme.primary} 35%, transparent)` }}
          >
            <h2 className="text-lg font-black text-white">Welcome to the Memory Map</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Walk around, tap pins, and discover the stories that happened here.
            </p>
            <ol className="mt-4 space-y-2 text-sm">
              {['Choose an area', 'Tap a pin', 'Watch, read or add a memory'].map((step, i) => (
                <li key={step} className="flex items-start gap-2">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={mmStepCircleStyle(theme)}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold leading-snug text-slate-100">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl px-4 py-3 text-sm font-black"
                style={mmPrimaryButtonStyle(theme)}
              >
                Start exploring
              </button>
              <Link
                href={`/memory-map/${mapSlug}/add`}
                onClick={dismiss}
                className="rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                Add a Memory
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MemoryMapThemedRoot>,
    document.body
  )
}
