'use client'

import { useEffect } from 'react'
import SponsoredSectionHeader from '@/components/advertising/SponsoredSectionHeader'
import MobileStickyAd from '@/components/advertising/MobileStickyAd'
import AdvertisingDemoBadge from '@/components/advertising/AdvertisingDemoBadge'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'
import { trackAnalyticsEvent, getAnalyticsDeviceType } from '@/lib/analytics/events'
import { supabase } from '@/lib/supabase'

type Props = {
  competitionSlug: string
  competitionName: string
  children: React.ReactNode
}

/** Client chrome for competition pages when Nova demo is active. */
export default function CompetitionDemoChrome({
  competitionSlug,
  competitionName,
  children,
}: Props) {
  const { enabled, branding } = useNovaDemo()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      trackAnalyticsEvent('competition_entered', {
        competition_slug: competitionSlug,
        page_type: 'competition',
        device_type: getAnalyticsDeviceType(),
        logged_in: Boolean(data.session?.user),
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, competitionSlug])

  return (
    <>
      {enabled ? (
        <div className="border-b border-amber-100 bg-amber-50/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
            <div>
              <p className="text-sm font-black text-slate-900">{branding.productName}</p>
              <p className="text-[11px] text-slate-500">{branding.poweredBy}</p>
            </div>
            <AdvertisingDemoBadge />
          </div>
        </div>
      ) : null}
      <SponsoredSectionHeader
        competitionName={competitionName}
        context={{ competitionSlug, pageType: 'competition' }}
      />
      {children}
      <MobileStickyAd context={{ competitionSlug, pageType: 'competition' }} />
    </>
  )
}
