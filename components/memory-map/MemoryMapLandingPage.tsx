'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { trackMemoryMapEvent } from '@/lib/memory-map/analytics'
import type { MemoryMap, MemoryMapBundle } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import { bundleStats } from '@/lib/memory-map/utils'
import { logMemoryMapPublicLink, memoryMapPublicPath } from '@/lib/memory-map/public-links'
import MemoryMapLogo from '@/components/memory-map/MemoryMapLogo'
import MemoryMapSponsorStrip from '@/components/memory-map/MemoryMapSponsorStrip'

type Props = {
  map: MemoryMap
  mapSlug: string
  bundle?: MemoryMapBundle
  fromQr?: boolean
}

export default function MemoryMapLandingPage({ map, mapSlug, bundle, fromQr }: Props) {
  const theme = memoryMapThemeVars(map)
  const bg = map.landing_background_url
  const stats = bundle ? bundleStats(bundle) : { areaCount: 0, pinCount: 0, storyCount: 0 }
  const mapHref = memoryMapPublicPath(mapSlug, 'map')
  const addHref = memoryMapPublicPath(mapSlug, 'add')

  useEffect(() => {
    void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'map_landing_viewed' })
    if (fromQr) {
      void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'qr_link_opened' })
    }
    logMemoryMapPublicLink({
      mapId: map.id,
      mapSlug,
      orgSlug: map.organisation?.slug,
      href: mapHref,
    })
  }, [map.id, map.organisation?.slug, mapSlug, mapHref, fromQr])

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

      <div className="mm-safe-top relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8">
        <section className="flex min-h-[58dvh] flex-col justify-end">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-white/10 p-2 shadow-lg backdrop-blur-sm">
              <MemoryMapLogo map={map} className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] mm-text-accent">Memory Map</p>
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
          <div className="mt-6">
            <MemoryMapSponsorStrip map={map} variant="footer" className="border-white/15 bg-black/40 backdrop-blur-sm" />
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <Link
            href={mapHref}
            className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-base font-black shadow-lg"
          >
            Open Memory Map
          </Link>
          <Link
            href={addHref}
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
