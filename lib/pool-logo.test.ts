import { describe, expect, it } from 'vitest'
import { parsePoolInviteRow } from './pools'
import {
  buildPoolLogoStoragePath,
  canShowPoolLogoUpload,
  poolLogoInitials,
  POOL_LOGO_MAX_BYTES,
  validatePoolLogoFile,
} from './pool-logo'

describe('pool logo helpers', () => {
  it('derives initials from pool name', () => {
    expect(poolLogoInitials('Rugby Factory')).toBe('R')
    expect(poolLogoInitials('')).toBe('P')
  })

  it('validates allowed file types and size', () => {
    const ok = new File([new Uint8Array(100)], 'logo.png', { type: 'image/png' })
    expect(validatePoolLogoFile(ok)).toBeNull()

    const tooLarge = new File([new Uint8Array(POOL_LOGO_MAX_BYTES + 1)], 'logo.png', {
      type: 'image/png',
    })
    expect(validatePoolLogoFile(tooLarge)).toMatch(/2 MB/)

    const badType = new File([new Uint8Array(10)], 'logo.gif', { type: 'image/gif' })
    expect(validatePoolLogoFile(badType)).toMatch(/PNG/)
  })

  it('builds predictable storage paths', () => {
    const file = new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' })
    const path = buildPoolLogoStoragePath('11111111-1111-1111-1111-111111111111', file)
    expect(path).toMatch(/^pools\/11111111-1111-1111-1111-111111111111\/logo-\d+\.png$/)
  })

  it('shows upload controls only for pool admins', () => {
    expect(canShowPoolLogoUpload(true)).toBe(true)
    expect(canShowPoolLogoUpload(false)).toBe(false)
  })
})

describe('pool invite logo field', () => {
  it('maps pool_logo_url from invite RPC rows', () => {
    const preview = parsePoolInviteRow({
      pool_id: 'pool-1',
      pool_name: 'Rugby Factory',
      pool_logo_url: 'https://example.com/logo.png',
      competition_slug: 'soccer-world-cup',
      competition_name: 'World Cup',
      is_public: true,
      is_closed: false,
      invite_token: 'abc',
      inviter_kind: 'admin',
    })
    expect(preview.logo_url).toBe('https://example.com/logo.png')
    expect(preview.name).toBe('Rugby Factory')
  })
})
