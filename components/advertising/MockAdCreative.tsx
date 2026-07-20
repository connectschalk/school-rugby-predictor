'use client'

import { trackAnalyticsEvent, getAnalyticsDeviceType } from '@/lib/analytics/events'
import type { ResolvedAdCreative } from '@/lib/advertising/ad-provider'
import type { AdPlacementId } from '@/lib/advertising/placements'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'

type Props = {
  creative: ResolvedAdCreative
  placementId: AdPlacementId
  variant?: 'default' | 'sponsor_strip' | 'sticky' | 'featured' | 'takeover'
  onCtaClick?: () => void
  compact?: boolean
}

export default function MockAdCreative({
  creative,
  placementId,
  variant = 'default',
  onCtaClick,
  compact,
}: Props) {
  const { enabled, region } = useNovaDemo()

  const handleCta = () => {
    trackAnalyticsEvent('ad_slot_clicked', {
      placement_id: placementId,
      region,
      device_type: getAnalyticsDeviceType(),
      page_type: undefined,
    })
    trackAnalyticsEvent('sponsor_clicked', {
      placement_id: placementId,
      region,
      device_type: getAnalyticsDeviceType(),
    })
    onCtaClick?.()
  }

  const isStrip = variant === 'sponsor_strip' || variant === 'featured'
  const isSticky = variant === 'sticky'
  const isTakeover = variant === 'takeover'

  return (
    <div
      className={[
        'relative w-full max-w-full overflow-hidden border',
        isSticky
          ? 'rounded-lg border-slate-300 bg-slate-900 text-white'
          : isStrip
            ? 'rounded-xl border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-slate-50'
            : isTakeover
              ? 'rounded-2xl border-slate-700 bg-gradient-to-br from-[#0f1419] via-[#161b22] to-[#1a2332] text-white'
              : 'rounded-xl border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100',
        compact ? 'p-2.5' : isTakeover ? 'p-4 sm:p-5' : 'p-3 sm:p-4',
      ].join(' ')}
      data-ad-placement={placementId}
      data-ad-mode={creative.mode}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            isSticky
              ? 'bg-white/15 text-white/90'
              : isTakeover
                ? 'bg-white/10 text-white/80'
                : 'bg-slate-200/80 text-slate-600',
          ].join(' ')}
        >
          {creative.disclosure}
        </span>
        {enabled ? (
          <span
            className={[
              'truncate font-mono text-[9px] tracking-tight',
              isSticky || isTakeover ? 'text-white/50' : 'text-slate-400',
            ].join(' ')}
            title={creative.gamUnitPath}
          >
            GAM placement: {creative.gamPlacementName}
          </span>
        ) : null}
        {enabled && creative.refreshEligible ? (
          <span
            className={[
              'text-[9px] font-medium',
              isSticky || isTakeover ? 'text-white/45' : 'text-slate-400',
            ].join(' ')}
          >
            Refresh eligible after meaningful interaction
          </span>
        ) : null}
      </div>

      <div
        className={[
          'mt-2 flex gap-3',
          isSticky ? 'items-center' : 'flex-col sm:flex-row sm:items-center sm:justify-between',
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <p
            className={[
              'font-black tracking-tight',
              isSticky ? 'text-sm text-white' : isTakeover ? 'text-lg text-white sm:text-xl' : 'text-base text-slate-900',
            ].join(' ')}
          >
            {creative.headline}
          </p>
          {!isSticky || !compact ? (
            <p
              className={[
                'mt-1 text-sm leading-snug',
                isSticky || isTakeover ? 'text-white/75' : 'text-slate-600',
              ].join(' ')}
            >
              {creative.body}
            </p>
          ) : null}
          <p
            className={[
              'mt-1.5 text-xs font-semibold',
              isSticky || isTakeover ? 'text-amber-200/90' : 'text-amber-800/80',
            ].join(' ')}
          >
            {creative.sponsorName}{' '}
            <span className="font-normal opacity-70">(placeholder)</span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleCta}
          className={[
            'shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            isSticky
              ? 'bg-white text-slate-900 hover:bg-slate-100 focus-visible:outline-white'
              : isTakeover
                ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-500'
                : 'bg-slate-900 text-white hover:bg-black focus-visible:outline-slate-900',
          ].join(' ')}
        >
          {creative.cta}
        </button>
      </div>
    </div>
  )
}
