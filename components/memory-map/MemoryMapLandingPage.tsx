'use client'

import Link from 'next/link'
import type { MemoryMap } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'

type Props = {
  map: MemoryMap
  mapSlug: string
}

export default function MemoryMapLandingPage({ map, mapSlug }: Props) {
  const theme = memoryMapThemeVars(map)
  const bg = map.landing_background_url

  return (
    <main className="relative min-h-dvh" style={theme}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: bg
            ? `linear-gradient(180deg, rgba(5,8,13,0.55) 0%, rgba(5,8,13,0.92) 65%), url(${bg})`
            : 'linear-gradient(180deg, #111827 0%, #05080D 100%)',
        }}
      />
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5">
            {map.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={map.profile_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-black text-[var(--mm-accent)]">NP</span>
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--mm-accent)]">Memory Map</p>
            <h1 className="text-2xl font-black leading-tight">{map.title}</h1>
          </div>
        </div>

        <p className="mm-muted mt-6 text-lg leading-relaxed">{map.tagline ?? 'Every place has a story.'}</p>
        {map.description ? <p className="mm-muted mt-3 text-sm leading-relaxed">{map.description}</p> : null}

        {map.sponsor_name ? (
          <div className="mm-card mt-8 rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Proudly sponsored by</p>
            <div className="mt-2 flex items-center gap-3">
              {map.sponsor_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={map.sponsor_logo_url} alt="" className="h-8 object-contain" />
              ) : (
                <span className="text-base font-bold">{map.sponsor_name}</span>
              )}
            </div>
            {map.sponsor_message ? (
              <p className="mm-muted mt-2 text-xs">{map.sponsor_message}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-10">
          <Link
            href={`/memory-map/${mapSlug}/map`}
            className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-sm font-black"
          >
            Open Memory Map
          </Link>
          <Link
            href={`/memory-map/${mapSlug}/add`}
            className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold"
          >
            Add a Memory
          </Link>
          <p className="mm-muted text-center text-xs">Scan the on-site QR code to open this map instantly.</p>
        </div>
      </div>
    </main>
  )
}
