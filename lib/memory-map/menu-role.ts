import type { ContributorAccess } from '@/lib/memory-map/membership'
import type { MemoryMapAccessLevel } from '@/lib/memory-map/permissions'
import { accessLevelLabel } from '@/lib/memory-map/permissions'
import type { MemberRole, MemberStatus } from '@/lib/memory-map/types'

export type MemoryMapRoleBadge =
  | 'Platform admin'
  | 'Organisation admin'
  | 'Map admin'
  | 'Moderator'
  | 'Contributor'
  | 'Pending contributor'
  | 'Viewer'
  | 'Memory Map member'

export function roleBadgeForMapAccess(access: ContributorAccess): MemoryMapRoleBadge {
  if (access.isAppAdmin) return 'Platform admin'
  if (access.isOrgAdmin) return 'Organisation admin'
  if (access.member?.status === 'pending') return 'Pending contributor'

  const role = access.member?.role
  const approved = access.member?.status === 'approved'

  if (approved && role === 'admin') return 'Map admin'
  if (approved && role === 'moderator') return 'Moderator'
  if (approved && role === 'contributor') return 'Contributor'
  if (approved && role === 'viewer') return 'Viewer'

  if (access.isMapSettingsAdmin) return 'Map admin'
  if (access.isContentModerator) return 'Moderator'
  if (access.isContributor) return 'Contributor'

  return 'Viewer'
}

export function roleBadgeForGlobalAccess(input: {
  isAppAdmin: boolean
  isOrgAdmin: boolean
  hasAccessibleMaps: boolean
}): MemoryMapRoleBadge | null {
  if (input.isAppAdmin) return 'Platform admin'
  if (input.isOrgAdmin) return 'Organisation admin'
  if (input.hasAccessibleMaps) return 'Memory Map member'
  return null
}

export function canShowAdminDashboardLink(input: {
  isAppAdmin: boolean
  hasModeratorOrAdminMaps: boolean
}): boolean {
  return input.isAppAdmin || input.hasModeratorOrAdminMaps
}

export function mapAccessLevelLabel(level: MemoryMapAccessLevel): string {
  return accessLevelLabel(level)
}

export function memberRoleLabel(role: MemberRole, status: MemberStatus): string {
  if (status === 'pending') return 'Pending contributor'
  switch (role) {
    case 'admin':
      return 'Map admin'
    case 'moderator':
      return 'Moderator'
    case 'contributor':
      return 'Contributor'
    case 'viewer':
      return 'Viewer'
    default:
      return 'Member'
  }
}
