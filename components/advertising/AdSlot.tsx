'use client'

import { useMemo } from 'react'
import { getAdProvider, type AdRenderContext } from '@/lib/advertising/ad-provider'
import type { AdPlacementId } from '@/lib/advertising/placements'
import { useAdSlotViewability } from '@/lib/analytics/use-ad-slot-viewability'
import { getAnalyticsDeviceType } from '@/lib/analytics/events'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'
import MockAdCreative from '@/components/advertising/MockAdCreative'
import type { AdSlotProps } from '@/components/advertising/ad-slot-types'

/**
 * Renders mock advert creatives when Nova demo mode is active.
 * Future: swap getAdProvider() to GamAdProvider without changing call sites.
 * Do not load Google Publisher Tag scripts in this demo implementation.
 */
export default function AdSlot({
  placement,
  context,
  className,
  refreshKey,
  variant = 'default',
}: AdSlotProps) {
  const { enabled, region } = useNovaDemo()

  const mergedContext: AdRenderContext = useMemo(
    () => ({
      ...context,
      region: context?.region ?? region,
      deviceType: context?.deviceType ?? getAnalyticsDeviceType(),
    }),
    [context, region]
  )

  const creative = useMemo(() => {
    if (!enabled) return null
    void refreshKey
    return getAdProvider().resolveCreative(placement, mergedContext)
  }, [enabled, placement, mergedContext, refreshKey])

  const viewRef = useAdSlotViewability({
    enabled: Boolean(enabled && creative),
    placementId: placement,
    context: {
      competition_slug: mergedContext.competitionSlug ?? undefined,
      page_type: mergedContext.pageType ?? undefined,
      region: mergedContext.region,
      device_type: mergedContext.deviceType,
      logged_in: mergedContext.loggedIn,
      placement_id: placement,
    },
  })

  if (!enabled || !creative) return null

  const reserve = Math.max(creative.reservedHeightMobile, creative.reservedHeightDesktop)

  return (
    <div
      ref={viewRef}
      className={['w-full max-w-full', className].filter(Boolean).join(' ')}
      style={reserve > 0 ? { minHeight: reserve } : undefined}
      aria-label={`${creative.disclosure}: ${creative.headline}`}
    >
      <MockAdCreative creative={creative} placementId={placement} variant={variant} />
    </div>
  )
}

export type { AdPlacementId, AdSlotProps }
