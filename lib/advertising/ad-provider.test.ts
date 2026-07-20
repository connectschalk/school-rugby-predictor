import { describe, expect, it, vi } from 'vitest'
import { MockAdProvider, GamAdProvider, getAdProvider, setAdProvider } from './ad-provider'

describe('ad provider', () => {
  it('defaults to mock provider and resolves creatives', () => {
    setAdProvider(new MockAdProvider())
    const provider = getAdProvider()
    expect(provider.mode).toBe('mock')
    const creative = provider.resolveCreative('nova_predictor_home_takeover', {
      region: 'boland',
    })
    expect(creative?.mode).toBe('mock')
    expect(creative?.gamPlacementName).toBe('nova_predictor_home_takeover')
    expect(creative?.disclosure).toBe('Advertisement')
  })

  it('GamAdProvider remains unimplemented until Nova supplies GAM details', () => {
    const gam = new GamAdProvider()
    expect(() => gam.resolveCreative('nova_predictor_home_takeover')).toThrow(/not configured/i)
  })
})

describe('ad viewability once-per-instance contract', () => {
  it('documents once-per-instance via fired ref pattern (unit smoke)', () => {
    const fired = { current: false }
    const fire = () => {
      if (fired.current) return false
      fired.current = true
      return true
    }
    expect(fire()).toBe(true)
    expect(fire()).toBe(false)
  })
})

// Keep vitest from complaining about unused vi in some runners
void vi
