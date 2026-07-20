/**
 * Nova Advertising Demo Mode — controlled activation helpers.
 *
 * Default: OFF (normal NextPlay Predictor branding and no mock ads).
 *
 * Activation:
 * 1. NEXT_PUBLIC_NOVA_AD_DEMO=true — enables demo for that deployment
 * 2. ?novaDemo=1 — enables in non-production, or when NEXT_PUBLIC_NOVA_DEMO_QUERY_ALLOWED=true
 *
 * Do not expose unfinished demo controls on the normal live site.
 */

export type NovaDemoBranding = {
  productName: string
  poweredBy: string
  badgeLabel: string
  /** Text-only placeholder when no approved Nova logo asset exists in the repo. */
  logoMode: 'text'
}

export function isNovaDemoEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NOVA_AD_DEMO === 'true'
}

/** Allow ?novaDemo=1 in production/staging only when explicitly opted in. */
export function isNovaDemoQueryAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.NEXT_PUBLIC_NOVA_DEMO_QUERY_ALLOWED === 'true'
}

export function resolveNovaDemoMode(searchParams?: URLSearchParams | null): boolean {
  if (isNovaDemoEnvEnabled()) return true
  if (!searchParams) return false
  const flag = searchParams.get('novaDemo')
  if (flag !== '1' && flag !== 'true') return false
  return isNovaDemoQueryAllowed()
}

/** Server / build-time check without search params (env only). */
export function isNovaDemoEnabled(): boolean {
  return isNovaDemoEnvEnabled()
}

export function getNovaDemoBranding(): NovaDemoBranding {
  return {
    productName: 'Nova Sports Predictor',
    poweredBy: 'Powered by NextPlay',
    badgeLabel: 'Advertising demo',
    logoMode: 'text',
  }
}

/** Persist demo query param on internal links when activated via URL. */
export function withNovaDemoParam(href: string, demoActive: boolean): string {
  if (!demoActive) return href
  try {
    const url = new URL(href, 'http://local.invalid')
    url.searchParams.set('novaDemo', '1')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    const join = href.includes('?') ? '&' : '?'
    return `${href}${join}novaDemo=1`
  }
}

export { getNovaAdPlacements, getAdPlacement } from '@/lib/advertising/placements'
export type { AdPlacementId, AdPlacementConfig, DemoRegion } from '@/lib/advertising/placements'
