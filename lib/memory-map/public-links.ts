export type MemoryMapPublicRoute = 'landing' | 'map' | 'add'

/** Public Memory Map path — always uses `memory_maps.slug`, never organisation slug. */
export function memoryMapPublicPath(mapSlug: string, route: MemoryMapPublicRoute = 'landing'): string {
  const slug = mapSlug.trim()
  if (route === 'map') return `/memory-map/${slug}/map`
  if (route === 'add') return `/memory-map/${slug}/add`
  return `/memory-map/${slug}`
}

export function logMemoryMapPublicLink(input: {
  mapId?: string | null
  mapSlug: string
  orgSlug?: string | null
  href: string
}): void {
  if (process.env.NODE_ENV !== 'development') return
  console.info(
    `[memory-map:public-link] mapId=${input.mapId ?? '—'} mapSlug=${input.mapSlug} orgSlug=${input.orgSlug ?? '—'} href=${input.href}`
  )
}
