'use client'

import { useEffect, useRef } from 'react'
import { trackAnalyticsEvent, type AnalyticsBaseContext } from '@/lib/analytics/events'

type Options = {
  enabled: boolean
  placementId: string
  context?: AnalyticsBaseContext
  /** Fraction of element visible (0–1). Default 0.5 */
  threshold?: number
  /** Milliseconds visible before firing. Default 1000 */
  dwellMs?: number
}

/**
 * Demo-only viewability helper.
 * Final GAM impression measurement will come from GAM, not this observer.
 */
export function useAdSlotViewability({
  enabled,
  placementId,
  context,
  threshold = 0.5,
  dwellMs = 1000,
}: Options) {
  const ref = useRef<HTMLDivElement | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!enabled || firedRef.current) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    let timer: ReturnType<typeof setTimeout> | null = null
    const contextSnapshot = context

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          if (timer) return
          timer = setTimeout(() => {
            if (firedRef.current) return
            firedRef.current = true
            trackAnalyticsEvent('ad_slot_viewed', {
              placement_id: placementId,
              ...contextSnapshot,
            })
            observer.disconnect()
          }, dwellMs)
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: [0, threshold, 1] }
    )

    observer.observe(el)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [enabled, placementId, threshold, dwellMs, context])

  return ref
}
