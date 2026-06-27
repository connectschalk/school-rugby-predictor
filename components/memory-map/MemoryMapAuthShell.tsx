'use client'

import Link from 'next/link'

type Props = {
  title?: string
  tagline?: string
  children: React.ReactNode
  backHref?: string
  backLabel?: string
}

export default function MemoryMapAuthShell({
  title = 'NextPlay Memory Map',
  tagline = 'Every place has a story.',
  children,
  backHref = '/memory-map',
  backLabel = 'Back to Memory Map',
}: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">{title}</p>
      <p className="mm-muted mt-2 text-sm">{tagline}</p>
      <div className="mm-card mt-8 rounded-2xl p-5 sm:p-6">{children}</div>
      <Link href={backHref} className="mm-muted mt-6 text-center text-sm font-bold underline underline-offset-4">
        {backLabel}
      </Link>
    </main>
  )
}
