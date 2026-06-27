import type { MemberRole, MemberStatus } from '@/lib/memory-map/types'

export type MemoryMapAccessLevel = 'platform' | 'organisation' | 'map_admin' | 'moderator' | 'contributor' | 'viewer' | 'none'

export type MemoryMapPermissionContext = {
  isAppAdmin: boolean
  isOrgAdmin: boolean
  mapMemberRole: MemberRole | null
  mapMemberStatus: MemberStatus | null
  isMapCreator: boolean
}

export type MemoryMapPermissions = {
  accessLevel: MemoryMapAccessLevel
  canAccessAdminDashboard: boolean
  canManageMapSettings: boolean
  canModerateContent: boolean
  canManageMembers: boolean
  canManageBranding: boolean
  canManageSponsor: boolean
  canAssignMapAdmin: boolean
  canSubmitContent: boolean
}

export function resolveMemoryMapPermissions(ctx: MemoryMapPermissionContext): MemoryMapPermissions {
  const approved = ctx.mapMemberStatus === 'approved'
  const mapRole = approved ? ctx.mapMemberRole : null

  const isSettingsAdmin =
    ctx.isAppAdmin ||
    ctx.isOrgAdmin ||
    ctx.isMapCreator ||
    (mapRole === 'admin')

  const isModerator = mapRole === 'moderator'
  const isContributor = mapRole === 'contributor'
  const isViewer = mapRole === 'viewer'

  const canAccessAdminDashboard = isSettingsAdmin || isModerator
  const canModerateContent = isSettingsAdmin || isModerator
  const canManageMapSettings = isSettingsAdmin
  const canSubmitContent = isSettingsAdmin || isModerator || isContributor

  let accessLevel: MemoryMapAccessLevel = 'none'
  if (ctx.isAppAdmin) accessLevel = 'platform'
  else if (ctx.isOrgAdmin) accessLevel = 'organisation'
  else if (mapRole === 'admin' || ctx.isMapCreator) accessLevel = 'map_admin'
  else if (isModerator) accessLevel = 'moderator'
  else if (isContributor) accessLevel = 'contributor'
  else if (isViewer) accessLevel = 'viewer'

  return {
    accessLevel,
    canAccessAdminDashboard,
    canManageMapSettings,
    canModerateContent,
    canManageMembers: canManageMapSettings,
    canManageBranding: canManageMapSettings,
    canManageSponsor: canManageMapSettings,
    canAssignMapAdmin: ctx.isAppAdmin || ctx.isOrgAdmin,
    canSubmitContent,
  }
}

export type AccessibleMemoryMap = {
  mapId: string
  mapSlug: string
  mapTitle: string
  mapStatus: string
  organisationId: string
  organisationName: string
  organisationSlug: string
  accessLevel: MemoryMapAccessLevel
}

export function accessLevelLabel(level: MemoryMapAccessLevel): string {
  switch (level) {
    case 'platform':
      return 'Platform admin'
    case 'organisation':
      return 'Organisation admin'
    case 'map_admin':
      return 'Map admin'
    case 'moderator':
      return 'Moderator'
    case 'contributor':
      return 'Contributor'
    case 'viewer':
      return 'Viewer'
    default:
      return 'No access'
  }
}

export function canAccessOtherOrganisation(
  viewerOrgIds: string[],
  targetOrganisationId: string,
  isAppAdmin: boolean
): boolean {
  if (isAppAdmin) return true
  return viewerOrgIds.includes(targetOrganisationId)
}
