/**
 * Shared advertising placement catalogue for Nova demo (and future GAM).
 * Mock creatives only — no real Google scripts.
 */

export type AdDevice = 'desktop' | 'mobile' | 'both'

export type AdSponsorshipType =
  | 'display'
  | 'section_sponsor'
  | 'leaderboard_sponsor'
  | 'featured_match'
  | 'regional'

export type AdPlacementId =
  | 'nova_predictor_home_takeover'
  | 'nova_predictor_competition_sponsor'
  | 'nova_predictor_fixture_inline'
  | 'nova_predictor_leaderboard_sponsor'
  | 'nova_predictor_results_inline'
  | 'nova_predictor_mobile_sticky'
  | 'nova_predictor_sponsored_match'
  | 'nova_predictor_regional_demo'

export type DemoRegion = 'boland' | 'northern_suburbs' | 'lowveld' | 'national'

export type AdPlacementConfig = {
  id: AdPlacementId
  gamPlacementName: string
  gamUnitPath: string
  displayName: string
  description: string
  pageLocation: string
  pageTypes: string[]
  supportedSizesDesktop: string[]
  supportedSizesMobile: string[]
  device: AdDevice
  mobileBehaviour: string
  refreshEligible: boolean
  refreshNote?: string
  sponsorshipType: AdSponsorshipType
  salesFormat: string
  demoCreative: {
    headline: string
    body: string
    cta: string
    sponsorName: string
  }
  regionalCreatives?: Partial<
    Record<
      DemoRegion,
      { headline: string; body: string; cta: string; sponsorName: string }
    >
  >
  active: boolean
  reservedHeightDesktop: number
  reservedHeightMobile: number
  gamNotes: string
}

export const DEMO_REGIONS: { id: DemoRegion; label: string }[] = [
  { id: 'boland', label: 'Boland' },
  { id: 'northern_suburbs', label: 'Northern Suburbs' },
  { id: 'lowveld', label: 'Lowveld' },
  { id: 'national', label: 'National' },
]

export const NOVA_AD_PLACEMENTS: AdPlacementConfig[] = [
  {
    id: 'nova_predictor_home_takeover',
    gamPlacementName: 'nova_predictor_home_takeover',
    gamUnitPath: '/nova_news/predictor/home_takeover',
    displayName: 'Homepage takeover',
    description: 'Premium banner beneath header, above competition doors.',
    pageLocation: 'Landing page — below header, above competition cards',
    pageTypes: ['landing'],
    supportedSizesDesktop: ['970x250', '970x90', '728x90'],
    supportedSizesMobile: ['320x100', '320x50'],
    device: 'both',
    mobileBehaviour: 'Responsive full-width banner; never overflows viewport',
    refreshEligible: false,
    sponsorshipType: 'display',
    salesFormat: 'Homepage takeover / roadblock',
    demoCreative: {
      headline: 'Nova News Predictor',
      body: 'Schools rugby. Local pride. Every prediction counts.',
      cta: 'Explore competitions',
      sponsorName: 'Demo Sponsor Co.',
    },
    active: true,
    reservedHeightDesktop: 120,
    reservedHeightMobile: 100,
    gamNotes: 'Map to /nova_news/predictor/home_takeover with size mapping for desktop vs mobile.',
  },
  {
    id: 'nova_predictor_competition_sponsor',
    gamPlacementName: 'nova_predictor_competition_sponsor',
    gamUnitPath: '/nova_news/predictor/competition_sponsor',
    displayName: 'Competition title sponsor',
    description: 'Premium section sponsorship near competition name.',
    pageLocation: 'Competition pages — below sub-nav, above page content',
    pageTypes: ['competition', 'predict', 'fixtures', 'leaderboard'],
    supportedSizesDesktop: ['728x90', 'sponsor_strip'],
    supportedSizesMobile: ['320x50', 'sponsor_strip'],
    device: 'both',
    mobileBehaviour: 'Compact sponsor strip; does not obstruct navigation',
    refreshEligible: false,
    sponsorshipType: 'section_sponsor',
    salesFormat: 'Title / section sponsorship',
    demoCreative: {
      headline: 'Schools Rugby Predictor',
      body: 'Presented by Demo Title Sponsor',
      cta: 'Learn more',
      sponsorName: 'Demo Title Sponsor',
    },
    active: true,
    reservedHeightDesktop: 56,
    reservedHeightMobile: 52,
    gamNotes: 'Sponsorship strip; often sold as fixed creative rather than rotating display.',
  },
  {
    id: 'nova_predictor_fixture_inline',
    gamPlacementName: 'nova_predictor_fixture_inline',
    gamUnitPath: '/nova_news/predictor/fixture_inline',
    displayName: 'Fixture-list inline advert',
    description: 'Inserted after every 4–5 fixture/predict cards.',
    pageLocation: 'Predict & fixtures lists — mid-feed',
    pageTypes: ['predict', 'fixtures'],
    supportedSizesDesktop: ['728x90', 'fluid'],
    supportedSizesMobile: ['320x100', 'fluid'],
    device: 'both',
    mobileBehaviour: 'Full card width; same radius/spacing as fixture cards',
    refreshEligible: true,
    refreshNote:
      'Demo: remounts after meaningful filter changes (pool/province/search). Cap refresh to ≥30s and in-viewport only when wiring real GAM. Real GAM refresh rules require Nova approval.',
    sponsorshipType: 'display',
    salesFormat: 'In-feed / native-style display',
    demoCreative: {
      headline: 'Match day essentials',
      body: 'Local rugby coverage from Nova News — stay ahead of every kick-off.',
      cta: 'Read more',
      sponsorName: 'Demo Local Retail',
    },
    regionalCreatives: {
      boland: {
        headline: 'Boland match-day deals',
        body: 'Demo Agricultural Partner — supporting Boland school rugby.',
        cta: 'View offer',
        sponsorName: 'Demo Agricultural Partner',
      },
      northern_suburbs: {
        headline: 'Northern Suburbs pride',
        body: 'Demo Education Retailer — kit and gear for the season.',
        cta: 'Shop demo',
        sponsorName: 'Demo Education Retailer',
      },
      lowveld: {
        headline: 'Lowveld weekends',
        body: 'Demo Tourism Board — explore the Lowveld between fixtures.',
        cta: 'Discover',
        sponsorName: 'Demo Tourism Board',
      },
      national: {
        headline: 'National partnership',
        body: 'Demo National Bank — banking the game from coast to coast.',
        cta: 'Find out more',
        sponsorName: 'Demo National Bank',
      },
    },
    active: true,
    reservedHeightDesktop: 100,
    reservedHeightMobile: 108,
    gamNotes: 'In-feed fluid unit; coordinate with Nova on native vs standard IAB sizes.',
  },
  {
    id: 'nova_predictor_leaderboard_sponsor',
    gamPlacementName: 'nova_predictor_leaderboard_sponsor',
    gamUnitPath: '/nova_news/predictor/leaderboard_sponsor',
    displayName: 'Leaderboard sponsorship',
    description: 'Premium strip above leaderboard table.',
    pageLocation: 'Leaderboard — above rankings table',
    pageTypes: ['leaderboard'],
    supportedSizesDesktop: ['728x90', 'sponsor_strip'],
    supportedSizesMobile: ['320x50', 'sponsor_strip'],
    device: 'both',
    mobileBehaviour: 'Compact strip; must not overpower rankings',
    refreshEligible: false,
    sponsorshipType: 'leaderboard_sponsor',
    salesFormat: 'Leaderboard presenting sponsorship',
    demoCreative: {
      headline: 'Leaderboard powered by Demo Rank Sponsor',
      body: 'Celebrate every correct margin — presented by our demo partner.',
      cta: 'View sponsor',
      sponsorName: 'Demo Rank Sponsor',
    },
    active: true,
    reservedHeightDesktop: 64,
    reservedHeightMobile: 60,
    gamNotes: 'Often a fixed sponsorship package rather than open auction inventory.',
  },
  {
    id: 'nova_predictor_results_inline',
    gamPlacementName: 'nova_predictor_results_inline',
    gamUnitPath: '/nova_news/predictor/results_inline',
    displayName: 'Results-page advertising',
    description: 'Between completed-match groups on fixtures/results views.',
    pageLocation: 'Fixtures (completed) / results grouping',
    pageTypes: ['fixtures', 'results'],
    supportedSizesDesktop: ['728x90', 'fluid'],
    supportedSizesMobile: ['320x100', 'fluid'],
    device: 'both',
    mobileBehaviour: 'Full width; does not disrupt score readability',
    refreshEligible: false,
    sponsorshipType: 'display',
    salesFormat: 'Results in-feed display',
    demoCreative: {
      headline: 'Full-time coverage',
      body: 'Nova News — scores, analysis, and school rugby stories.',
      cta: 'Open Nova',
      sponsorName: 'Demo Media Partner',
    },
    active: true,
    reservedHeightDesktop: 96,
    reservedHeightMobile: 100,
    gamNotes: 'Place after sensible result group boundaries; avoid interrupting score lines.',
  },
  {
    id: 'nova_predictor_mobile_sticky',
    gamPlacementName: 'nova_predictor_mobile_sticky',
    gamUnitPath: '/nova_news/predictor/mobile_sticky',
    displayName: 'Mobile sticky advert',
    description: 'Fixed near bottom of viewport on mobile only; dismissible for session.',
    pageLocation: 'Global mobile overlay (demo competition pages)',
    pageTypes: ['predict', 'fixtures', 'leaderboard', 'competition'],
    supportedSizesDesktop: [],
    supportedSizesMobile: ['320x50'],
    device: 'mobile',
    mobileBehaviour:
      'Fixed above safe-area; close persists for session; must not cover nav/CTAs',
    refreshEligible: false,
    sponsorshipType: 'display',
    salesFormat: 'Mobile sticky / anchor',
    demoCreative: {
      headline: 'Nova on the go',
      body: 'Demo Mobile Sponsor — school rugby in your pocket.',
      cta: 'Tap',
      sponsorName: 'Demo Mobile Sponsor',
    },
    active: true,
    reservedHeightDesktop: 0,
    reservedHeightMobile: 56,
    gamNotes: 'Anchor units need careful UX review; GAM sticky templates preferred.',
  },
  {
    id: 'nova_predictor_sponsored_match',
    gamPlacementName: 'nova_predictor_sponsored_match',
    gamUnitPath: '/nova_news/predictor/sponsored_match',
    displayName: 'Sponsored match feature',
    description: 'Clearly disclosed featured match treatment on one selected fixture.',
    pageLocation: 'Predict list — first eligible upcoming match (demo)',
    pageTypes: ['predict'],
    supportedSizesDesktop: ['featured_card'],
    supportedSizesMobile: ['featured_card'],
    device: 'both',
    mobileBehaviour: 'Enhanced card; prediction inputs remain fully usable',
    refreshEligible: false,
    sponsorshipType: 'featured_match',
    salesFormat: 'Sponsored / featured match package',
    demoCreative: {
      headline: 'Featured match',
      body: 'Presented by Demo Match Sponsor — sponsorship does not affect scoring.',
      cta: 'Sponsor site',
      sponsorName: 'Demo Match Sponsor',
    },
    active: true,
    reservedHeightDesktop: 40,
    reservedHeightMobile: 40,
    gamNotes: 'Content sponsorship; disclosure required; not a standard display auction unit.',
  },
  {
    id: 'nova_predictor_regional_demo',
    gamPlacementName: 'nova_predictor_regional_demo',
    gamUnitPath: '/nova_news/predictor/regional_demo',
    displayName: 'Regional targeting demonstration',
    description: 'Demo-only regional creative variation for sales conversations.',
    pageLocation: 'Admin inventory panel + fixture inline regional variants',
    pageTypes: ['admin_demo'],
    supportedSizesDesktop: ['728x90', 'fluid'],
    supportedSizesMobile: ['320x100', 'fluid'],
    device: 'both',
    mobileBehaviour: 'Same as fixture inline when used as preview',
    refreshEligible: false,
    sponsorshipType: 'regional',
    salesFormat: 'Geo / regional targeting package',
    demoCreative: {
      headline: 'National showcase',
      body: 'Switch demo region in the inventory panel to preview local creatives.',
      cta: 'Select region',
      sponsorName: 'Demo National Telecom',
    },
    regionalCreatives: {
      boland: {
        headline: 'Boland focus',
        body: 'Demo Agricultural Partner — local pride across Boland schools.',
        cta: 'Local offer',
        sponsorName: 'Demo Agricultural Partner',
      },
      northern_suburbs: {
        headline: 'Northern Suburbs focus',
        body: 'Demo Education Retailer — kit up for the season.',
        cta: 'Local offer',
        sponsorName: 'Demo Education Retailer',
      },
      lowveld: {
        headline: 'Lowveld focus',
        body: 'Demo Tourism Board — weekends built around the game.',
        cta: 'Local offer',
        sponsorName: 'Demo Tourism Board',
      },
      national: {
        headline: 'National focus',
        body: 'Demo National Telecom — connecting fans everywhere.',
        cta: 'National offer',
        sponsorName: 'Demo National Telecom',
      },
    },
    active: true,
    reservedHeightDesktop: 100,
    reservedHeightMobile: 108,
    gamNotes: 'Pass key-values (e.g. region) from Nova-approved targeting keys only — no PII.',
  },
]

export function getNovaAdPlacements(): AdPlacementConfig[] {
  return NOVA_AD_PLACEMENTS
}

export function getAdPlacement(id: AdPlacementId): AdPlacementConfig | undefined {
  return NOVA_AD_PLACEMENTS.find((p) => p.id === id)
}

export function getCreativeForPlacement(
  placement: AdPlacementConfig,
  region: DemoRegion = 'national'
): AdPlacementConfig['demoCreative'] {
  return placement.regionalCreatives?.[region] ?? placement.demoCreative
}

/** Insert inline ad indices after every `interval` items; never after the final item. */
export function inlineAdInsertIndices(itemCount: number, interval = 5): number[] {
  if (itemCount <= interval) return []
  const indices: number[] = []
  for (let i = interval; i < itemCount; i += interval) {
    // Insert after index i-1 (0-based). Skip if that would be after the last item.
    if (i >= itemCount) break
    indices.push(i)
  }
  // Filter any that equal itemCount (would be trailing)
  return indices.filter((i) => i > 0 && i < itemCount)
}

export const MOBILE_STICKY_DISMISS_KEY = 'nova_ad_mobile_sticky_dismissed'
export const DEMO_REGION_STORAGE_KEY = 'nova_ad_demo_region'
export const INLINE_AD_REFRESH_MIN_MS = 30_000
