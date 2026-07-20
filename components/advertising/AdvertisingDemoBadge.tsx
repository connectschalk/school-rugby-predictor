'use client'

import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'

/** Discreet badge visible only in Nova advertising demo mode. */
export default function AdvertisingDemoBadge({ className }: { className?: string }) {
  const { enabled, branding } = useNovaDemo()
  if (!enabled) return null

  return (
    <span
      className={[
        'inline-flex items-center rounded-md border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {branding.badgeLabel}
    </span>
  )
}
