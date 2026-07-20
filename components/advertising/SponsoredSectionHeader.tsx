'use client'

import AdSlot from '@/components/advertising/AdSlot'
import type { AdRenderContext } from '@/lib/advertising/ad-provider'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'

type Props = {
  context?: AdRenderContext
  competitionName?: string
}

/** Premium section sponsorship strip near competition title. */
export default function SponsoredSectionHeader({ context, competitionName }: Props) {
  const { enabled } = useNovaDemo()
  if (!enabled) return null

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
      <p className="mb-2 text-center text-xs font-medium text-slate-500">
        {competitionName
          ? `${competitionName} — title sponsorship demo`
          : 'Competition title sponsorship demo'}
      </p>
      <AdSlot
        placement="nova_predictor_competition_sponsor"
        context={{ ...context, pageType: context?.pageType ?? 'competition' }}
        variant="sponsor_strip"
      />
    </div>
  )
}
