'use client'

import { useCallback, useSyncExternalStore } from 'react'
import AdSlot from '@/components/advertising/AdSlot'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'
import { MOBILE_STICKY_DISMISS_KEY } from '@/lib/advertising/placements'
import { trackAnalyticsEvent, getAnalyticsDeviceType } from '@/lib/analytics/events'
import type { AdRenderContext } from '@/lib/advertising/ad-provider'

type Props = {
  context?: AdRenderContext
}

const dismissListeners = new Set<() => void>()

function emitDismissChange() {
  dismissListeners.forEach((l) => l())
}

function subscribeDismiss(onStoreChange: () => void) {
  dismissListeners.add(onStoreChange)
  return () => {
    dismissListeners.delete(onStoreChange)
  }
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return sessionStorage.getItem(MOBILE_STICKY_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Mobile-only sticky advert. Fixed above safe-area; dismiss persists for the session.
 * Does not use document flow height (avoids CLS). Offset leaves room for bottom UI.
 */
export default function MobileStickyAd({ context }: Props) {
  const { enabled } = useNovaDemo()
  const dismissed = useSyncExternalStore(subscribeDismiss, readDismissed, () => true)

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(MOBILE_STICKY_DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    emitDismissChange()
    trackAnalyticsEvent('mobile_ad_dismissed', {
      placement_id: 'nova_predictor_mobile_sticky',
      device_type: getAnalyticsDeviceType(),
      page_type: context?.pageType ?? undefined,
      competition_slug: context?.competitionSlug ?? undefined,
    })
  }, [context])

  if (!enabled || dismissed) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 md:hidden motion-reduce:transition-none"
      style={{
        bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
      }}
      role="complementary"
      aria-label="Advertisement"
    >
      <div className="pointer-events-auto mx-auto flex max-w-lg items-start gap-2 px-3">
        <div className="min-w-0 flex-1 shadow-lg shadow-black/20">
          <AdSlot
            placement="nova_predictor_mobile_sticky"
            context={context}
            variant="sticky"
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-1 shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
          aria-label="Close advertisement"
        >
          Close
        </button>
      </div>
    </div>
  )
}
