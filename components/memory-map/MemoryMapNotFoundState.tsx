import Link from 'next/link'

export default function MemoryMapNotFoundState() {
  return (
    <main className="mm-root mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">NextPlay Memory Map</p>
      <h1 className="mt-3 text-2xl font-black leading-tight">Memory Map not found</h1>
      <p className="mm-muted mt-4 text-sm leading-relaxed">
        We could not find this Memory Map. Check the link or ask the admin.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link href="/memory-map" className="mm-btn-primary rounded-2xl px-5 py-4 text-center text-sm font-black">
          Back to Memory Map
        </Link>
        <Link href="/memory-map/find" className="mm-btn-secondary rounded-2xl px-5 py-4 text-center text-sm font-bold">
          Find a Memory Map
        </Link>
      </div>
    </main>
  )
}
