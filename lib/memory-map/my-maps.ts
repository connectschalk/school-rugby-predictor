import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMemoryMapPlatformAdmin } from '@/lib/admin-access'
import type { MemberRole, MemberStatus } from '@/lib/memory-map/types'
import type { MemoryMapAccessLevel } from '@/lib/memory-map/permissions'

export type MyMemoryMapEntry = {
  mapId: string
  mapSlug: string
  mapTitle: string
  mapStatus: string
  organisationName: string
  role: MemberRole | 'organisation_admin' | 'platform_admin'
  memberStatus: MemberStatus | 'approved'
  accessLevel: MemoryMapAccessLevel | 'contributor' | 'viewer' | 'pending' | 'admin'
  canAddMemory: boolean
  canOpenAdmin: boolean
}

type RpcRow = {
  map_id: string
  map_slug: string
  map_title: string
  map_status: string
  organisation_name: string
  access_level: string
}

export async function fetchMyMemoryMapEntries(
  client: SupabaseClient,
  userId: string
): Promise<MyMemoryMapEntry[]> {
  const { isAdmin: isAppAdmin } = await fetchMemoryMapPlatformAdmin(client, userId)
  const byMapId = new Map<string, MyMemoryMapEntry>()

  const { data: rpcRows } = await client.rpc('list_accessible_memory_maps')
  for (const row of (rpcRows as RpcRow[] | null) ?? []) {
    const accessLevel = row.access_level as MemoryMapAccessLevel
    byMapId.set(String(row.map_id), {
      mapId: String(row.map_id),
      mapSlug: String(row.map_slug),
      mapTitle: String(row.map_title),
      mapStatus: String(row.map_status),
      organisationName: String(row.organisation_name),
      role:
        accessLevel === 'platform'
          ? 'platform_admin'
          : accessLevel === 'organisation'
            ? 'organisation_admin'
            : accessLevel === 'moderator'
              ? 'moderator'
              : 'admin',
      memberStatus: 'approved',
      accessLevel,
      canAddMemory: true,
      canOpenAdmin: true,
    })
  }

  const { data: memberRows } = await client
    .from('memory_map_members')
    .select('role, status, memory_maps(id, slug, title, status, organisations(name))')
    .eq('user_id', userId)

  for (const row of memberRows ?? []) {
    const map = row.memory_maps as unknown as {
      id: string
      slug: string
      title: string
      status: string
      organisations: { name: string } | { name: string }[] | null
    } | null
    if (!map?.id) continue

    const org = Array.isArray(map.organisations) ? map.organisations[0] : map.organisations

    const mapId = String(map.id)
    if (byMapId.has(mapId)) continue

    const role = row.role as MemberRole
    const status = row.status as MemberStatus
    byMapId.set(mapId, {
      mapId,
      mapSlug: String(map.slug),
      mapTitle: String(map.title),
      mapStatus: String(map.status),
      organisationName: org?.name ?? map.title,
      role,
      memberStatus: status,
      accessLevel:
        status === 'pending'
          ? 'pending'
          : role === 'viewer'
            ? 'viewer'
            : role === 'contributor'
              ? 'contributor'
              : role,
      canAddMemory: status === 'approved' && (role === 'contributor' || role === 'admin' || role === 'moderator'),
      canOpenAdmin: false,
    })
  }

  if (isAppAdmin) {
    for (const entry of byMapId.values()) {
      entry.canOpenAdmin = true
    }
  }

  return Array.from(byMapId.values()).sort((a, b) => a.mapTitle.localeCompare(b.mapTitle))
}

export async function userHasAdminDashboardAccess(client: SupabaseClient): Promise<boolean> {
  const { data: sessionData } = await client.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) return false

  const { isAdmin } = await fetchMemoryMapPlatformAdmin(client, userId)
  if (isAdmin) return true

  const { data } = await client.rpc('list_accessible_memory_maps')
  return ((data as RpcRow[] | null) ?? []).some((row) =>
    ['platform', 'organisation', 'map_admin', 'moderator'].includes(String(row.access_level))
  )
}
