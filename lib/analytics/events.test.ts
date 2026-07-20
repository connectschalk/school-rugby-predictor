import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  pushToDataLayer,
  sanitizeAnalyticsPayload,
  trackAnalyticsEvent,
} from './events'
import { MOBILE_STICKY_DISMISS_KEY } from '@/lib/advertising/placements'

describe('analytics events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not throw when dataLayer is missing', () => {
    vi.stubGlobal('window', {} as Window & typeof globalThis)
    expect(() => trackAnalyticsEvent('prediction_submitted', { match_id: 'm1' })).not.toThrow()
    expect(() => pushToDataLayer('ad_slot_clicked', { placement_id: 'x' })).not.toThrow()
  })

  it('pushes to dataLayer when present', () => {
    const dataLayer: Record<string, unknown>[] = []
    vi.stubGlobal('window', { dataLayer } as unknown as Window & typeof globalThis)
    trackAnalyticsEvent('leaderboard_viewed', {
      competition_slug: 'nextplay-schools',
      logged_in: true,
    })
    expect(dataLayer).toHaveLength(1)
    expect(dataLayer[0]?.event).toBe('leaderboard_viewed')
    expect(dataLayer[0]?.competition_slug).toBe('nextplay-schools')
  })

  it('strips obvious PII fields from payloads', () => {
    const clean = sanitizeAnalyticsPayload({
      email: 'a@b.com',
      name: 'Pat',
      phone: '082',
      prediction_text: 'home by 12',
      predicted_winner: 'home',
      match_id: 'abc',
      placement_id: 'nova_predictor_fixture_inline',
    })
    expect(clean).toEqual({
      match_id: 'abc',
      placement_id: 'nova_predictor_fixture_inline',
    })
    expect(clean).not.toHaveProperty('email')
    expect(clean).not.toHaveProperty('name')
    expect(clean).not.toHaveProperty('phone')
  })
})

describe('mobile sticky dismiss key', () => {
  it('uses a stable sessionStorage key', () => {
    expect(MOBILE_STICKY_DISMISS_KEY).toBe('nova_ad_mobile_sticky_dismissed')
  })

  it('persists dismissal for the session via sessionStorage', () => {
    const store = new Map<string, string>()
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
    }
    sessionStorage.setItem(MOBILE_STICKY_DISMISS_KEY, '1')
    expect(sessionStorage.getItem(MOBILE_STICKY_DISMISS_KEY)).toBe('1')
  })
})
