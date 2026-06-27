import Link from 'next/link'
import { DEMO_MAP_SLUG } from '@/lib/memory-map/constants'
import MemoryMapNotFoundState from '@/components/memory-map/MemoryMapNotFoundState'

export type MemoryMapUnavailableReason = 'not_found' | 'private'

type Props = {
  slug: string
  reason: MemoryMapUnavailableReason
}

export default function MemoryMapUnavailableState({ slug, reason }: Props) {
  if (reason === 'not_found') {
    return <MemoryMapNotFoundState />
  }

  const isPrivate = reason === 'private'

  return (
    <main className="mm-root mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">
        NextPlay Memory Map
      </p>
      <h1 className="mt-3 text-2xl font-black leading-tight">
        {isPrivate ? 'This Memory Map is private' : 'Memory Map not found'}
      </h1>
      <p className="mm-muted mt-4 text-sm leading-relaxed">
        {isPrivate
          ? 'Sign in or request access to add memories to this map.'
          : 'We could not find this Memory Map. Check the link or ask the admin.'}
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/memory-map/${slug}`}
          className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-sm font-black"
        >
          Back to Memory Map
        </Link>
        <Link href="/memory-map/find" className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold">
          Find a Memory Map
        </Link>
        {process.env.NODE_ENV === 'development' ? (
          <Link
            href={`/memory-map/${DEMO_MAP_SLUG}/add`}
            className="text-center text-xs font-bold text-white/50 underline"
          >
            Go to demo add flow
          </Link>
        ) : null}
      </div>
    </main>
  )
}
