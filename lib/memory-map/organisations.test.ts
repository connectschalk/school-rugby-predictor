import { describe, expect, it, vi } from 'vitest'
import {
  buildOrganisationAdminInviteUrl,
  MEMORY_MAP_ORG_DASHBOARD_PATH_PREFIX,
  MEMORY_MAP_ORG_INVITE_PATH_PREFIX,
  organisationAdminInvitePath,
  organisationDashboardPath,
  resolveOrganisationAccessLevel,
  shouldShowMemoryMapPlatformAdminLink,
} from './organisations'

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrl: () => 'https://www.thenextplay.co.za',
}))

describe('memory-map organisations', () => {
  it('builds invite URLs under memory-map path', () => {
    expect(organisationAdminInvitePath('abc123')).toBe(`${MEMORY_MAP_ORG_INVITE_PATH_PREFIX}abc123`)
    expect(buildOrganisationAdminInviteUrl('abc123')).toBe(
      'https://www.thenextplay.co.za/memory-map/invite/abc123'
    )
  })

  it('builds organisation dashboard paths', () => {
    expect(organisationDashboardPath('grey-high')).toBe(`${MEMORY_MAP_ORG_DASHBOARD_PATH_PREFIX}grey-high`)
  })

  it('resolves organisation access levels', () => {
    expect(resolveOrganisationAccessLevel(true, false)).toBe('platform_admin')
    expect(resolveOrganisationAccessLevel(true, true)).toBe('platform_admin')
    expect(resolveOrganisationAccessLevel(false, true)).toBe('organisation_admin')
    expect(resolveOrganisationAccessLevel(false, false)).toBeNull()
  })

  it('shows platform admin link only for platform admins', () => {
    expect(shouldShowMemoryMapPlatformAdminLink(true)).toBe(true)
    expect(shouldShowMemoryMapPlatformAdminLink(false)).toBe(false)
  })
})
