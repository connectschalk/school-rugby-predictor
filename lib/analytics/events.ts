/**
 * Typed analytics / GTM dataLayer helpers.
 * Safe when window.dataLayer is missing. Client-side only.
 * Never push PII (email, name, phone, prediction text).
 */

export type AnalyticsDeviceType = 'mobile' | 'desktop' | 'unknown'

export type AnalyticsBaseContext = {
  competition_slug?: string
  match_id?: string
  pool_id?: string
  placement_id?: string
  page_type?: string
  region?: string
  device_type?: AnalyticsDeviceType
  logged_in?: boolean
}

export type AnalyticsEventName =
  | 'predictor_registration_started'
  | 'predictor_registration_completed'
  | 'predictor_login'
  | 'prediction_submitted'
  | 'competition_entered'
  | 'match_viewed'
  | 'leaderboard_viewed'
  | 'pool_created'
  | 'pool_joined'
  | 'predictor_share_clicked'
  | 'sponsor_clicked'
  | 'ad_slot_viewed'
  | 'ad_slot_clicked'
  | 'mobile_ad_dismissed'

const PII_KEYS = new Set([
  'email',
  'user_email',
  'name',
  'display_name',
  'full_name',
  'first_name',
  'surname',
  'phone',
  'phone_number',
  'prediction',
  'prediction_text',
  'predicted_winner',
  'predicted_margin',
  'predicted_home_score',
  'predicted_away_score',
])

export function sanitizeAnalyticsPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (PII_KEYS.has(key)) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

export function pushToDataLayer(event: AnalyticsEventName, params: AnalyticsBaseContext = {}): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as Window & { dataLayer?: Record<string, unknown>[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({
      event,
      ...sanitizeAnalyticsPayload(params as Record<string, unknown>),
    })
  } catch {
    // Never throw — analytics must not break product flows.
  }
}

export function trackAnalyticsEvent(
  event: AnalyticsEventName,
  params: AnalyticsBaseContext = {}
): void {
  pushToDataLayer(event, params)
}

export function getAnalyticsDeviceType(): AnalyticsDeviceType {
  if (typeof window === 'undefined') return 'unknown'
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop'
}

/** Documented event catalogue for Nova / GTM mapping. */
export const ANALYTICS_EVENT_DOCS: Record<AnalyticsEventName, string> = {
  predictor_registration_started: 'User opens signup / registration flow',
  predictor_registration_completed: 'User completes registration (post-success)',
  predictor_login: 'User completes login (post-success)',
  prediction_submitted: 'Prediction saved successfully',
  competition_entered: 'User opens a competition environment',
  match_viewed: 'Match detail / predict card viewed',
  leaderboard_viewed: 'Leaderboard page viewed',
  pool_created: 'Pool created successfully',
  pool_joined: 'Pool join / request approved path',
  predictor_share_clicked: 'Share action clicked',
  sponsor_clicked: 'Sponsor CTA clicked',
  ad_slot_viewed: 'Demo viewability: ≥50% visible for ≥1s (once per slot instance)',
  ad_slot_clicked: 'Mock ad / CTA clicked',
  mobile_ad_dismissed: 'Mobile sticky ad closed for session',
}
