'use client'

import type { ReactNode } from 'react'
import AdSlot from '@/components/advertising/AdSlot'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'
import { getCreativeForPlacement, getAdPlacement } from '@/lib/advertising/placements'
import type { AdRenderContext } from '@/lib/advertising/ad-provider'
import { trackAnalyticsEvent, getAnalyticsDeviceType } from '@/lib/analytics/events'

type Props = {
  children: ReactNode
  /** Apply sponsored treatment when true (caller selects which match). */
  active?: boolean
  context?: AdRenderContext
  matchId?: string
}

/**
 * Clearly disclosed featured-match sponsorship shell.
 * Does not change scoring rules or prediction behaviour.
 */
export default function SponsoredMatchShell({ children, active = true, context, matchId }: Props) {
  const { enabled, region } = useNovaDemo()
  if (!enabled || !active) return <>{children}</>

  const placement = getAdPlacement('nova_predictor_sponsored_match')
  const creative = placement
    ? getCreativeForPlacement(placement, region)
    : { headline: 'Featured match', body: '', cta: '', sponsorName: 'Demo Match Sponsor' }

  return (
    <div className="rounded-2xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-50/80 to-white p-2 shadow-sm ring-1 ring-amber-200/50">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/90">Sponsored</p>
          <p className="text-sm font-black text-slate-900">{creative.headline}</p>
          <p className="text-xs text-slate-600">
            Presented by {creative.sponsorName}{' '}
            <span className="font-normal text-slate-500">(placeholder — does not affect scoring)</span>
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black"
          onClick={() => {
            trackAnalyticsEvent('sponsor_clicked', {
              placement_id: 'nova_predictor_sponsored_match',
              match_id: matchId,
              region,
              device_type: getAnalyticsDeviceType(),
              competition_slug: context?.competitionSlug ?? undefined,
            })
          }}
        >
          {creative.cta || 'View sponsor'}
        </button>
      </div>
      {/* Hidden slot for GAM mapping / viewability demo */}
      <div className="sr-only">
        <AdSlot placement="nova_predictor_sponsored_match" context={context} variant="featured" />
      </div>
      {children}
    </div>
  )
}
