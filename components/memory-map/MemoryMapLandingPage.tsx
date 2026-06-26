'use client'

import Link from 'next/link'
import type { MemoryMap, MemoryMapBundle } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import { bundleStats } from '@/lib/memory-map/utils'

type Props = {
  map: MemoryMap
  mapSlug: string
  bundle?: MemoryMapBundle
}

export default function MemoryMapLandingPage({ map, mapSlug, bundle }: Props) {
  const theme = memoryMapThemeVars(map)
  const bg = map.landing_background_url
  const stats = bundle ? bundleStats(bundle) : { areaCount: 0, pinCount: 0, storyCount: 0 }

  return (
    <main className="relative min-h-dvh" style={theme}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: bg
            ? `linear-gradient(180deg, rgba(5,8,13,0.45) 0%, rgba(5,8,13,0.75) 40%, rgba(5,8,13,0.95) 100%), url(${bg})`
            : 'linear-gradient(180deg, #1a2332 0%, #05080D 55%, #05080D 100%)',
        }}
      />

      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <section className="flex min-h-[58dvh] flex-col justify-end">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
              {map.profile_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={map.profile_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-[var(--mm-accent)]">NP</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--mm-accent)]">Memory Map</p>
              <h1 className="text-3xl font-black leading-tight drop-shadow-sm">{map.title}</h1>
              <p className="mt-1 text-base font-medium text-white/90">{map.tagline ?? 'Every place has a story.'}</p>
            </div>
          </div>

          {map.description ? (
            <p className="mm-muted mt-5 text-sm leading-relaxed">{map.description}</p>
          ) : null}

          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              ['Areas', stats.areaCount],
              ['Pins', stats.pinCount],
              ['Stories', stats.storyCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-center backdrop-blur-sm">
                <p className="text-xl font-black">{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/60">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {map.sponsor_name ? (
          <div className="mm-card mt-6 rounded-2xl border-white/15 bg-black/40 p-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Proudly sponsored by</p>
            <div className="mt-2 flex items-center gap-3">
              {map.sponsor_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={map.sponsor_logo_url} alt="" className="h-9 max-w-[120px] object-contain" />
              ) : null}
              <span className="text-base font-bold">{map.sponsor_name}</span>
            </div>
            {map.sponsor_message ? <p className="mm-muted mt-2 text-xs leading-relaxed">{map.sponsor_message}</p> : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <Link
            href={`/memory-map/${mapSlug}/map`}
            className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-base font-black shadow-lg"
          >
            Open Memory Map
          </Link>
          <Link
            href={`/memory-map/${mapSlug}/add`}
            className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold"
          >
            Add a Memory
          </Link>
          <p className="mm-muted px-2 text-center text-xs leading-relaxed">
            Scan the QR code on-site to explore stories where they happened.
          </p>
        </div>
      </div>
    </main>
  )
}
