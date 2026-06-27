import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_GROUPS, groupForTab, isAdminTab, labelForTab } from './admin-nav'

describe('admin-nav', () => {
  it('includes all admin tabs exactly once', () => {
    const tabIds = ADMIN_NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.id !== 'setup').map((i) => i.id))
    expect(tabIds).toContain('overview')
    expect(tabIds).toContain('add-content')
    expect(tabIds).toContain('pending')
    expect(tabIds).toContain('qa')
    expect(new Set(tabIds).size).toBe(tabIds.length)
  })

  it('lists Add content under Content group', () => {
    const content = ADMIN_NAV_GROUPS.find((g) => g.id === 'content')
    expect(content?.items[0]?.id).toBe('add-content')
  })

  it('resolves group and label for pending tab', () => {
    expect(groupForTab('pending').id).toBe('content')
    expect(labelForTab('pending')).toBe('Pending stories')
  })

  it('lists Map Defaults under Map Setup group', () => {
    const mapSetup = ADMIN_NAV_GROUPS.find((g) => g.id === 'map-setup')
    expect(mapSetup?.items.some((i) => i.id === 'map-defaults')).toBe(true)
    expect(labelForTab('map-defaults')).toBe('Map Defaults')
  })

  it('validates admin tab ids', () => {
    expect(isAdminTab('map-defaults')).toBe(true)
    expect(isAdminTab('pending')).toBe(true)
    expect(isAdminTab('setup')).toBe(false)
  })
})
