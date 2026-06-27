import { describe, expect, it } from 'vitest'
import {
  canShowAdminDashboardLink,
  roleBadgeForGlobalAccess,
  roleBadgeForMapAccess,
} from './menu-role'
import type { ContributorAccess } from './membership'

function baseAccess(overrides: Partial<ContributorAccess>): ContributorAccess {
  return {
    userId: 'user-1',
    isLoggedIn: true,
    isAppAdmin: false,
    isOrgAdmin: false,
    isMapAdmin: false,
    isMapSettingsAdmin: false,
    isContentModerator: false,
    isContributor: false,
    canSubmit: false,
    hasSubmissionPolicy: false,
    permissions: {
      accessLevel: 'none',
      canAccessAdminDashboard: false,
      canManageMapSettings: false,
      canModerateContent: false,
      canManageMembers: false,
      canManageBranding: false,
      canManageSponsor: false,
      canAssignMapAdmin: false,
      canSubmitContent: false,
    },
    member: null,
    ...overrides,
  }
}

describe('roleBadgeForMapAccess', () => {
  it('shows platform admin badge', () => {
    expect(roleBadgeForMapAccess(baseAccess({ isAppAdmin: true }))).toBe('Platform admin')
  })

  it('shows contributor badge', () => {
    expect(
      roleBadgeForMapAccess(
        baseAccess({
          member: {
            id: 'm1',
            memory_map_id: 'map1',
            user_id: 'user-1',
            role: 'contributor',
            status: 'approved',
            relationship: null,
            request_message: null,
            approved_at: null,
          },
          isContributor: true,
        })
      )
    ).toBe('Contributor')
  })
})

describe('canShowAdminDashboardLink', () => {
  it('shows for platform admin', () => {
    expect(canShowAdminDashboardLink({ isAppAdmin: true, hasModeratorOrAdminMaps: false })).toBe(true)
  })

  it('hides for non-admin users', () => {
    expect(canShowAdminDashboardLink({ isAppAdmin: false, hasModeratorOrAdminMaps: false })).toBe(false)
  })

  it('shows for users with moderator/admin maps', () => {
    expect(canShowAdminDashboardLink({ isAppAdmin: false, hasModeratorOrAdminMaps: true })).toBe(true)
  })
})

describe('roleBadgeForGlobalAccess', () => {
  it('shows memory map member when user has accessible maps', () => {
    expect(roleBadgeForGlobalAccess({ isAppAdmin: false, isOrgAdmin: false, hasAccessibleMaps: true })).toBe(
      'Memory Map member'
    )
  })
})

describe('logged-out menu links', () => {
  it('points add memory gate to memory map sign-in', () => {
    const href = '/memory-map/auth/sign-in?next=%2Fmemory-map%2Fboishaai%2Fadd'
    expect(href.startsWith('/memory-map/auth/sign-in')).toBe(true)
    expect(href).toContain('next=%2Fmemory-map')
  })
})
