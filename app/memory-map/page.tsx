import Link from 'next/link'
import { DEMO_MAP_ID, DEMO_MAP_SLUG, MEMORY_MAP_TAGLINE } from '@/lib/memory-map/constants'

export default function MemoryMapEntryPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--mm-accent,#FFD400)]">
        NextPlay Memory Map
      </p>
      <h1 className="mt-3 text-3xl font-black leading-tight">Place-based story archives</h1>
      <p className="mm-muted mt-4 text-base leading-relaxed">{MEMORY_MAP_TAGLINE}</p>
      <p className="mm-muted mt-3 text-sm leading-relaxed">
        Three ways in: view memories on the map, add your own story, or manage the map as admin.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/memory-map/${DEMO_MAP_SLUG}`}
          className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-sm font-black"
        >
          View a Memory Map
        </Link>
        <Link
          href={`/memory-map/${DEMO_MAP_SLUG}/add`}
          className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold"
        >
          Add a Memory
        </Link>
        <Link
          href={`/memory-map/admin/${DEMO_MAP_ID}`}
          className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold"
        >
          Admin dashboard
        </Link>
      </div>

      <p className="mm-muted mt-auto pt-12 text-center text-xs">
        Standalone module — not linked from main NextPlay navigation.
      </p>
    </main>
  )
}
