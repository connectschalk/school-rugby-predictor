import type { AdPlacementId } from '@/lib/advertising/placements'
import type { AdRenderContext } from '@/lib/advertising/ad-provider'

export type AdSlotProps = {
  placement: AdPlacementId
  context?: AdRenderContext
  className?: string
  /** Force remount / creative refresh key (fixture inline demo). */
  refreshKey?: string | number
  variant?: 'default' | 'sponsor_strip' | 'sticky' | 'featured' | 'takeover'
}
