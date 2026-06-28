import { describe, expect, it } from 'vitest'
import { normalizePoolInviteJoinMode, poolInviteJoinModeLabel } from './pool-invite-join-mode'

describe('normalizePoolInviteJoinMode', () => {
  it('defaults to request', () => {
    expect(normalizePoolInviteJoinMode(undefined)).toBe('request')
    expect(normalizePoolInviteJoinMode('request')).toBe('request')
  })

  it('accepts auto', () => {
    expect(normalizePoolInviteJoinMode('auto')).toBe('auto')
  })

  it('falls back for unknown values', () => {
    expect(normalizePoolInviteJoinMode('invalid')).toBe('request')
  })
})

describe('poolInviteJoinModeLabel', () => {
  it('returns UI labels', () => {
    expect(poolInviteJoinModeLabel('request')).toBe('Request to join')
    expect(poolInviteJoinModeLabel('auto')).toBe('Join automatically')
  })
})
