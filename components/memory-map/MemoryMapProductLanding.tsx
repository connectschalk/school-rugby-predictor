'use client'

import Link from 'next/link'
import { DEMO_MAP_SLUG } from '@/lib/memory-map/constants'
import {
  MEMORY_MAP_PRODUCT_HEADLINE,
  MEMORY_MAP_PRODUCT_SUBHEADLINE,
  MEMORY_MAP_TAGLINE,
  type PublicMemoryMapDirectory,
} from '@/lib/memory-map/directory-types'
import MemoryMapDirectoryPanel from '@/components/memory-map/MemoryMapDirectoryPanel'

type Props = {
  directory: PublicMemoryMapDirectory
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function MemoryMapProductLanding({ directory }: Props) {
  return (
    <main className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40"
        aria-hidden
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(255,212,0,0.12) 0%, transparent 45%), radial-gradient(circle at 80% 10%, rgba(59,130,246,0.08) 0%, transparent 40%)',
        }}
      />

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
        <p className="text-xs font-bold uppercase tracking-[0.25em] mm-text-accent">
          NextPlay Memory Map
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl">{MEMORY_MAP_PRODUCT_HEADLINE}</h1>
        <p className="mm-muted mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">{MEMORY_MAP_PRODUCT_SUBHEADLINE}</p>
        <p className="mm-muted mt-3 max-w-2xl text-sm">{MEMORY_MAP_TAGLINE}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => scrollTo('find')}
            className="mm-btn-primary rounded-2xl px-6 py-4 text-sm font-black sm:min-w-[200px]"
          >
            Find a Memory Map
          </button>
          <Link
            href="/memory-map/admin/create"
            className="mm-btn-secondary rounded-2xl px-6 py-4 text-center text-sm font-bold sm:min-w-[200px]"
          >
            Create Memory Map
          </Link>
          <button
            type="button"
            onClick={() => scrollTo('about')}
            className="mm-text-accent rounded-2xl px-2 py-4 text-sm font-bold underline-offset-4 hover:underline sm:px-4"
          >
            Learn how it works
          </button>
        </div>
      </section>

      {/* Journey cards */}
      <section className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => scrollTo('about')}
            className="mm-card mm-card-interactive rounded-2xl p-5 text-left"
          >
            <p className="mm-text-accent text-xs font-bold uppercase tracking-wide">About</p>
            <h2 className="mt-2 text-lg font-black">About Memory Map</h2>
            <p className="mm-muted mt-2 text-sm leading-relaxed">
              See how a school, event or venue can turn its spaces into a living archive of stories.
            </p>
            <span className="mt-4 inline-block text-xs font-bold">Learn more →</span>
          </button>

          <Link
            href="/memory-map/admin/create"
            className="mm-card mm-card-interactive block rounded-2xl p-5"
          >
            <p className="mm-text-accent text-xs font-bold uppercase tracking-wide">Create</p>
            <h2 className="mt-2 text-lg font-black">Create a Memory Map</h2>
            <p className="mm-muted mt-2 text-sm leading-relaxed">
              For schools, venues and event organisers who want a branded map, contributor approvals and QR codes.
            </p>
            <span className="mt-4 inline-block text-xs font-bold">Create map →</span>
          </Link>

          <button
            type="button"
            onClick={() => scrollTo('find')}
            className="mm-card mm-card-interactive rounded-2xl p-5 text-left"
          >
            <p className="mm-text-accent text-xs font-bold uppercase tracking-wide">Find</p>
            <h2 className="mt-2 text-lg font-black">Find a Memory Map</h2>
            <p className="mm-muted mt-2 text-sm leading-relaxed">
              Search for a school, event, sports field, hostel or place and explore the stories pinned there.
            </p>
            <span className="mt-4 inline-block text-xs font-bold">Find map →</span>
          </button>
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-6 border-t border-white/10 bg-white/[0.02] py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <h2 className="text-2xl font-black sm:text-3xl">What is a Memory Map?</h2>
          <p className="mm-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Memory Map lets a school or place create a secure map where approved people can add videos, photos and
            written memories to exact locations. Visitors can open the map, walk around, tap pins and discover what
            happened there.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { step: '1', title: 'Create a place', text: 'Set up your school, venue or event with branded areas and maps.' },
              { step: '2', title: 'Add stories to pins', text: 'Contributors pin photos, videos and memories to exact locations.' },
              { step: '3', title: 'Explore on the map', text: 'Visitors tap pins, scan QR codes on-site and discover stories.' },
            ].map((item) => (
              <div key={item.step} className="mm-card rounded-2xl p-4">
                <span className="mm-text-accent text-2xl font-black">{item.step}</span>
                <p className="mt-2 font-bold">{item.title}</p>
                <p className="mm-muted mt-1 text-sm">{item.text}</p>
              </div>
            ))}
          </div>

          <p className="mm-muted mt-8 text-xs font-bold uppercase tracking-wide text-white/50">Great for</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Rugby field highlights',
              'Hostel memories',
              'School history',
              'Event stories',
              "Old boys' archive",
              'Heritage trail',
            ].map((example) => (
              <span key={example} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                {example}
              </span>
            ))}
          </div>

          <ul className="mm-muted mt-8 grid gap-2 text-sm sm:grid-cols-2">
            <li>Walk around and tap pins on geo or indoor maps</li>
            <li>View videos, photos and text memories</li>
            <li>Add your own memories where allowed</li>
            <li>Scan QR codes on-site to open the map</li>
            <li>Explore stories linked to exact places</li>
          </ul>
        </div>
      </section>

      {/* Find */}
      <section id="find" className="scroll-mt-6 py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <MemoryMapDirectoryPanel
          liveEntries={directory.liveEntries}
          demoEntry={directory.demoEntry}
          directoryUnavailable={directory.directoryUnavailable}
        />
          <p className="mm-muted mt-6 text-center text-xs">
            <Link href="/memory-map/find" className="underline underline-offset-2 hover:text-white">
              Open full directory page
            </Link>
          </p>
        </div>
      </section>

      {/* Create */}
      <section id="create" className="scroll-mt-6 border-t border-white/10 bg-white/[0.02] py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <h2 className="text-2xl font-black sm:text-3xl">Create a Memory Map for your school or event</h2>
          <p className="mm-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Set up a branded map, add areas, invite contributors, approve stories and generate QR codes for people to
            scan on-site.
          </p>

          <ul className="mt-8 grid gap-2 text-sm sm:grid-cols-2">
            {[
              'Branded school or event landing page',
              'Multiple areas and maps',
              'Geo maps and indoor/school maps',
              'Contributor approvals',
              'Admin review and moderation',
              'Sponsor branding',
              'QR posters',
              'Photo, video and text memories',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="mm-text-accent">✓</span>
                <span className="mm-muted">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/memory-map/admin/create" className="mm-btn-primary rounded-2xl px-6 py-4 text-center text-sm font-black">
              Create Memory Map
            </Link>
            <Link href="/memory-map/admin" className="mm-btn-secondary rounded-2xl px-6 py-4 text-center text-sm font-bold">
              Open admin dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="scroll-mt-6 border-t border-white/10 py-14">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <h2 className="text-xl font-black">Try the demo</h2>
          <p className="mm-muted mt-2 text-sm">
            Explore the Boishaai preview map to see how Memory Map works before creating your own.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={`/memory-map/${DEMO_MAP_SLUG}`}
              className="mm-btn-secondary rounded-2xl px-5 py-3 text-center text-sm font-bold"
            >
              Open Boishaai demo
            </Link>
            <Link
              href={`/memory-map/${DEMO_MAP_SLUG}/add`}
              className="mm-btn-secondary rounded-2xl px-5 py-3 text-center text-sm font-bold"
            >
              Add a demo memory
            </Link>
            <Link
              href="/memory-map/admin"
              className="mm-btn-secondary rounded-2xl px-5 py-3 text-center text-sm font-bold"
            >
              Admin demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center">
        <p className="mm-muted text-xs">Standalone module — not linked from main NextPlay navigation.</p>
      </footer>
    </main>
  )
}
