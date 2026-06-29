import { hasCustomMemoryMapLogo, resolveMemoryMapLogoUrl } from '@/lib/memory-map/branding'
import type { MemoryMap, MemoryOrganisation } from '@/lib/memory-map/types'

type Props = {
  map: Pick<MemoryMap, 'profile_image_url'> & {
    organisation?: Pick<MemoryOrganisation, 'logo_url'> | null
  }
  className?: string
}

export default function MemoryMapLogo({ map, className = '' }: Props) {
  const src = resolveMemoryMapLogoUrl(map)
  const fit = hasCustomMemoryMapLogo(map) ? 'object-cover' : 'object-contain'

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`${fit} ${className}`.trim()} />
  )
}
