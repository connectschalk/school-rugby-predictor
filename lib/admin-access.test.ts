import { describe, expect, it } from 'vitest'
import { isProfileAdminRole } from './admin-access'

describe('admin-access', () => {
  it('recognises legacy profile admin role', () => {
    expect(isProfileAdminRole('admin')).toBe(true)
    expect(isProfileAdminRole('user')).toBe(false)
    expect(isProfileAdminRole(null)).toBe(false)
  })
})
