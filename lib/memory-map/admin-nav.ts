import type { AdminTab } from '@/lib/memory-map/types'

export type AdminNavItem = {
  id: AdminTab | 'setup'
  label: string
  /** When set, navigates via link instead of tab change (e.g. setup wizard). */
  href?: (mapId: string) => string
}

export type AdminNavGroup = {
  id: string
  label: string
  items: AdminNavItem[]
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'pilot', label: 'Pilot Checklist' },
      { id: 'qa', label: 'Pilot QA' },
      { id: 'setup', label: 'Setup Wizard', href: (mapId) => `/memory-map/admin/${mapId}/setup` },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { id: 'add-content', label: 'Add content' },
      { id: 'pending', label: 'Pending stories' },
      { id: 'published', label: 'Published stories' },
      { id: 'pins', label: 'Pins' },
      { id: 'audit', label: 'Audit log' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [{ id: 'contributors', label: 'Contributors' }],
  },
  {
    id: 'map-setup',
    label: 'Map Setup',
    items: [
      { id: 'areas', label: 'Areas' },
      { id: 'map-defaults', label: 'Map Defaults' },
      { id: 'categories', label: 'Categories' },
    ],
  },
  {
    id: 'branding',
    label: 'Branding & Sponsor',
    items: [
      { id: 'branding', label: 'Branding' },
      { id: 'sponsor', label: 'Sponsor' },
      { id: 'share', label: 'Share / QR' },
    ],
  },
]

export const ALL_ADMIN_TABS: AdminTab[] = ADMIN_NAV_GROUPS.flatMap((group) =>
  group.items.filter((item): item is AdminNavItem & { id: AdminTab } => item.id !== 'setup').map((item) => item.id)
)

export function isAdminTab(id: string): id is AdminTab {
  return ALL_ADMIN_TABS.includes(id as AdminTab)
}

export function groupForTab(tab: AdminTab): AdminNavGroup {
  return ADMIN_NAV_GROUPS.find((group) => group.items.some((item) => item.id === tab)) ?? ADMIN_NAV_GROUPS[0]!
}

export function labelForTab(tab: AdminTab): string {
  for (const group of ADMIN_NAV_GROUPS) {
    const item = group.items.find((i) => i.id === tab)
    if (item) return item.label
  }
  return tab
}
