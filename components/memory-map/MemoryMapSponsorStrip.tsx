'use client'

import type { MemoryMap } from '@/lib/memory-map/types'

type Variant = 'banner' | 'footer' | 'subtle'

type Props = {
  map: MemoryMap
  variant?: Variant
  className?: string
}

export default function MemoryMapSponsorStrip({ map, variant = 'banner', className = '' }: Props) {
  if (!map.sponsor_name) return null

  const inner = (
    <>
      {map.sponsor_logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={map.sponsor_logo_url} alt="" className="h-5 w-auto max-w-[72px] object-contain" />
      ) : null}
      <span className={variant === 'subtle' ? 'text-[10px] text-white/50' : 'text-xs font-semibold'}>
        {variant === 'banner' ? `Proudly sponsored by ${map.sponsor_name}` : map.sponsor_name}
      </span>
    </>
  )

  const content =
    variant === 'footer' ? (
      <div className={`mm-card rounded-xl p-3 text-center ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Proudly sponsored by</p>
        <div className="mt-2 flex items-center justify-center gap-2">{inner}</div>
        {map.sponsor_message ? <p className="mm-muted mt-1 text-[10px]">{map.sponsor_message}</p> : null}
      </div>
    ) : variant === 'subtle' ? (
      <div className={`flex items-center justify-center gap-2 border-t border-white/10 px-4 py-2 ${className}`}>{inner}</div>
    ) : (
      <div className={`flex items-center gap-2 border-b border-white/10 px-4 py-2 ${className}`}>
        {inner}
      </div>
    )

  if (map.sponsor_website_url) {
    return (
      <a
        href={map.sponsor_website_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition hover:opacity-90"
      >
        {content}
      </a>
    )
  }

  return content
}
