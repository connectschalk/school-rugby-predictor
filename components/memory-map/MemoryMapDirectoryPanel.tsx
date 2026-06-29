'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_MEMORY_MAP_LOGO_SRC } from '@/lib/memory-map/branding'
import {
  filterDirectoryEntries,
  organisationTypeLabel,
  type DirectoryOrganisationFilter,
  type MemoryMapDirectoryEntry,
} from '@/lib/memory-map/directory-types'

const FILTERS: { id: DirectoryOrganisationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'school', label: 'Schools' },
  { id: 'event', label: 'Events' },
  { id: 'venue', label: 'Venues' },
]

type Props = {
  liveEntries: MemoryMapDirectoryEntry[]
  demoEntry: MemoryMapDirectoryEntry | null
  showHeading?: boolean
  directoryUnavailable?: boolean
}

function DirectoryCard({ entry }: { entry: MemoryMapDirectoryEntry }) {
  const thumb = entry.landingBackgroundUrl ?? entry.profileImageUrl ?? entry.organisationLogoUrl

  return (
    <Link
      href={`/memory-map/${entry.slug}`}
      className="mm-card mm-directory-card mm-group block overflow-hidden rounded-2xl transition"
    >
      <div
        className="relative h-32 bg-cover bg-center"
        style={{
          backgroundImage: thumb
            ? `linear-gradient(180deg, rgba(5,8,13,0.2) 0%, rgba(5,8,13,0.85) 100%), url(${thumb})`
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #14532d 100%)',
        }}
      >
        {entry.isDemoPreview ? (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-black uppercase text-black">
            Demo / Preview
          </span>
        ) : entry.visibility === 'public' ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase backdrop-blur-sm">
            Public
          </span>
        ) : null}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-black/40 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.profileImageUrl ?? entry.organisationLogoUrl ?? DEFAULT_MEMORY_MAP_LOGO_SRC}
              alt=""
              className={`h-full w-full ${
                entry.profileImageUrl || entry.organisationLogoUrl ? 'object-cover' : 'object-contain'
              }`}
            />
          </div>
        </div>
      </div>
      <div className="p-4">
        <p className="mm-group-hover-accent font-black leading-snug">{entry.title}</p>
        <p className="mm-muted mt-1 text-xs">
          {entry.organisationName} · {organisationTypeLabel(entry.organisationType)}
        </p>
        {entry.tagline ? <p className="mm-muted mt-2 line-clamp-2 text-sm">{entry.tagline}</p> : null}
        <p className="mm-muted mt-3 text-xs">
          {entry.areaCount} areas · {entry.pinCount} pins · {entry.storyCount} stories
        </p>
        {entry.sponsorName ? (
          <p className="mm-muted mt-2 text-[10px] uppercase tracking-wide">Sponsored by {entry.sponsorName}</p>
        ) : null}
        <span className="mm-text-accent mt-3 inline-block text-xs font-bold">Open map →</span>
      </div>
    </Link>
  )
}

export default function MemoryMapDirectoryPanel({
  liveEntries,
  demoEntry,
  showHeading = true,
  directoryUnavailable = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DirectoryOrganisationFilter>('all')

  const filteredLive = useMemo(
    () => filterDirectoryEntries(liveEntries, query, filter),
    [liveEntries, query, filter]
  )

  const filteredDemo =
    demoEntry && filterDirectoryEntries([demoEntry], query, filter).length > 0 ? demoEntry : null

  return (
    <section className={showHeading ? '' : 'pt-0'}>
      {showHeading ? (
        <>
          <h2 className="text-2xl font-black sm:text-3xl">Find a Memory Map</h2>
          <p className="mm-muted mt-2 max-w-2xl text-sm leading-relaxed sm:text-base">
            Search for a school, event, sports field, hostel or place and explore the stories pinned there.
          </p>
        </>
      ) : null}

      <div className="mt-6 space-y-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search school, event or place"
          className="mm-input w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                filter === chip.id
                  ? 'mm-filter-chip is-active'
                  : 'border border-white/15 bg-white/5 text-white/80'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {directoryUnavailable ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-bold text-amber-50">Place-based story archives</p>
          <p className="mt-1 text-sm text-amber-100">
            The Memory Map directory is temporarily unavailable.
          </p>
        </div>
      ) : null}

      {liveEntries.length === 0 ? (
        <p className="mm-muted mt-6 text-sm">No public Memory Maps yet.</p>
      ) : filteredLive.length === 0 ? (
        <p className="mm-muted mt-6 text-sm">No maps match your search.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLive.map((entry) => (
            <DirectoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {filteredDemo ? (
        <div className="mt-8">
          {liveEntries.length > 0 ? (
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-white/50">Preview demo</p>
          ) : null}
          <DirectoryCard entry={filteredDemo} />
        </div>
      ) : null}
    </section>
  )
}
