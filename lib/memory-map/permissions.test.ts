import { describe, expect, it } from 'vitest'
import {
  accessLevelLabel,
  canAccessOtherOrganisation,
  resolveMemoryMapPermissions,
  type MemoryMapPermissionContext,
} from './permissions'
import { cannotApproveOwnStory } from './own-story-approval'

function ctx(overrides: Partial<MemoryMapPermissionContext>): MemoryMapPermissionContext {
  return {
    isAppAdmin: false,
    isOrgAdmin: false,
    mapMemberRole: null,
    mapMemberStatus: null,
    isMapCreator: false,
    ...overrides,
  }
}

describe('resolveMemoryMapPermissions', () => {
  it('grants platform admin full map access', () => {
    const perms = resolveMemoryMapPermissions(ctx({ isAppAdmin: true }))
    expect(perms.accessLevel).toBe('platform')
    expect(perms.canAccessAdminDashboard).toBe(true)
    expect(perms.canManageMapSettings).toBe(true)
    expect(perms.canModerateContent).toBe(true)
    expect(perms.canAssignMapAdmin).toBe(true)
  })

  it('grants organisation admin settings access for their org maps', () => {
    const perms = resolveMemoryMapPermissions(ctx({ isOrgAdmin: true }))
    expect(perms.accessLevel).toBe('organisation')
    expect(perms.canManageMapSettings).toBe(true)
    expect(perms.canModerateContent).toBe(true)
    expect(perms.canAssignMapAdmin).toBe(true)
  })

  it('restricts organisation admin to their org via helper', () => {
    expect(canAccessOtherOrganisation(['org-a'], 'org-a', false)).toBe(true)
    expect(canAccessOtherOrganisation(['org-a'], 'org-b', false)).toBe(false)
    expect(canAccessOtherOrganisation([], 'org-b', true)).toBe(true)
  })

  it('allows map admin access only to assigned map', () => {
    const perms = resolveMemoryMapPermissions(
      ctx({ mapMemberRole: 'admin', mapMemberStatus: 'approved' })
    )
    expect(perms.accessLevel).toBe('map_admin')
    expect(perms.canManageMapSettings).toBe(true)
    expect(perms.canAssignMapAdmin).toBe(false)
  })

  it('allows moderators content access but not settings', () => {
    const perms = resolveMemoryMapPermissions(
      ctx({ mapMemberRole: 'moderator', mapMemberStatus: 'approved' })
    )
    expect(perms.accessLevel).toBe('moderator')
    expect(perms.canAccessAdminDashboard).toBe(true)
    expect(perms.canModerateContent).toBe(true)
    expect(perms.canManageMapSettings).toBe(false)
    expect(perms.canManageBranding).toBe(false)
    expect(perms.canManageMembers).toBe(false)
  })

  it('blocks contributors from admin dashboard', () => {
    const perms = resolveMemoryMapPermissions(
      ctx({ mapMemberRole: 'contributor', mapMemberStatus: 'approved' })
    )
    expect(perms.canAccessAdminDashboard).toBe(false)
    expect(perms.canSubmitContent).toBe(true)
    expect(perms.canModerateContent).toBe(false)
  })

  it('blocks viewers from admin and submit', () => {
    const perms = resolveMemoryMapPermissions(
      ctx({ mapMemberRole: 'viewer', mapMemberStatus: 'approved' })
    )
    expect(perms.canAccessAdminDashboard).toBe(false)
    expect(perms.canSubmitContent).toBe(false)
  })
})

describe('own-story approval policy', () => {
  it('allows platform admin to approve own story', () => {
    expect(
      cannotApproveOwnStory({ uploaded_by: 'user-1', governance_flags: {} }, 'user-1', true)
    ).toBe(false)
  })

  it('blocks normal admin from approving own contributor story', () => {
    expect(
      cannotApproveOwnStory({ uploaded_by: 'user-1', governance_flags: {} }, 'user-1', false)
    ).toBe(true)
  })
})

describe('accessLevelLabel', () => {
  it('labels platform admin', () => {
    expect(accessLevelLabel('platform')).toBe('Platform admin')
  })
})
