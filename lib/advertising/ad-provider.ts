/**
 * Ad provider interface — mock today, Google Ad Manager (GPT) later.
 *
 * Do NOT load Google Publisher Tag scripts in the current demo.
 * When Nova supplies network code + ad unit paths, implement `GamAdProvider`
 * and switch via `getAdProvider()` without rewriting page call sites.
 */

import type { AdPlacementId, DemoRegion } from '@/lib/advertising/placements'
import { getAdPlacement, getCreativeForPlacement } from '@/lib/advertising/placements'

export type AdRenderContext = {
  competitionSlug?: string | null
  province?: string | null
  pageType?: string | null
  loggedIn?: boolean
  region?: DemoRegion
  deviceType?: 'mobile' | 'desktop' | 'unknown'
}

export type ResolvedAdCreative = {
  placementId: AdPlacementId
  gamPlacementName: string
  gamUnitPath: string
  disclosure: 'Advertisement' | 'Sponsored'
  headline: string
  body: string
  cta: string
  sponsorName: string
  reservedHeightDesktop: number
  reservedHeightMobile: number
  refreshEligible: boolean
  refreshNote?: string
  mode: 'mock' | 'gam'
}

export interface AdProvider {
  readonly mode: 'mock' | 'gam'
  resolveCreative(
    placementId: AdPlacementId,
    context?: AdRenderContext
  ): ResolvedAdCreative | null
}

export class MockAdProvider implements AdProvider {
  readonly mode = 'mock' as const

  resolveCreative(
    placementId: AdPlacementId,
    context?: AdRenderContext
  ): ResolvedAdCreative | null {
    const placement = getAdPlacement(placementId)
    if (!placement || !placement.active) return null
    const creative = getCreativeForPlacement(placement, context?.region ?? 'national')
    const sponsorshipStrip =
      placement.sponsorshipType === 'section_sponsor' ||
      placement.sponsorshipType === 'leaderboard_sponsor' ||
      placement.sponsorshipType === 'featured_match'
    return {
      placementId,
      gamPlacementName: placement.gamPlacementName,
      gamUnitPath: placement.gamUnitPath,
      disclosure: sponsorshipStrip ? 'Sponsored' : 'Advertisement',
      headline: creative.headline,
      body: creative.body,
      cta: creative.cta,
      sponsorName: creative.sponsorName,
      reservedHeightDesktop: placement.reservedHeightDesktop,
      reservedHeightMobile: placement.reservedHeightMobile,
      refreshEligible: placement.refreshEligible,
      refreshNote: placement.refreshNote,
      mode: 'mock',
    }
  }
}

/**
 * Future: Google Publisher Tag / Google Ad Manager provider.
 *
 * Integration steps (see docs/nova-gam-integration.md):
 * 1. Load GPT only after consent checks pass.
 * 2. Define googletag.defineSlot(unitPath, sizes, divId) per placement.
 * 3. Apply size mapping for mobile vs desktop.
 * 4. Set targeting keys (competition_slug, page_type, region) — never PII.
 * 5. Display slots; rely on GAM for impressions, not the demo IntersectionObserver.
 *
 * This class intentionally throws until Nova supplies network + unit details.
 */
export class GamAdProvider implements AdProvider {
  readonly mode = 'gam' as const

  resolveCreative(
    placementId: AdPlacementId,
    context?: AdRenderContext
  ): ResolvedAdCreative | null {
    void placementId
    void context
    throw new Error(
      'GamAdProvider is not configured. Keep MockAdProvider until Nova provides GAM network code and ad unit paths.'
    )
  }
}

let provider: AdProvider = new MockAdProvider()

export function getAdProvider(): AdProvider {
  return provider
}

/** Test / future hook — do not call from production UI until GAM is ready. */
export function setAdProvider(next: AdProvider): void {
  provider = next
}
