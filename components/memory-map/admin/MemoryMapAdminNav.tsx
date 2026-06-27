'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  groupForTab,
  labelForTab,
  navGroupsForAccess,
  type AdminNavGroup,
  type AdminNavItem,
} from '@/lib/memory-map/admin-nav'
import type { AdminTab } from '@/lib/memory-map/types'

type Props = {
  mapId: string
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  canManageSettings?: boolean
  badges?: Partial<Record<AdminTab, number>>
}

function badgeForItem(item: AdminNavItem, badges?: Partial<Record<AdminTab, number>>): number | undefined {
  if (item.id === 'setup') return undefined
  const n = badges?.[item.id]
  return n && n > 0 ? n : undefined
}

function NavItemButton({
  item,
  mapId,
  active,
  badge,
  onSelect,
  className = '',
}: {
  item: AdminNavItem
  mapId: string
  active: boolean
  badge?: number
  onSelect: () => void
  className?: string
}) {
  const label = (
    <>
      {item.label}
      {badge != null ? ` (${badge})` : ''}
    </>
  )

  if (item.href) {
    return (
      <Link
        href={item.href(mapId)}
        onClick={onSelect}
        className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
          active ? 'mm-bg-accent-15 mm-text-accent' : 'text-white/90 hover:bg-white/5'
        } ${className}`}
      >
        {label}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
        active ? 'mm-bg-accent-15 mm-text-accent' : 'text-white/90 hover:bg-white/5'
      } ${className}`}
    >
      {label}
    </button>
  )
}

function GroupDropdown({
  group,
  mapId,
  activeTab,
  open,
  onToggle,
  onTabChange,
  badges,
  onClose,
}: {
  group: AdminNavGroup
  mapId: string
  activeTab: AdminTab
  open: boolean
  onToggle: () => void
  onTabChange: (tab: AdminTab) => void
  badges?: Partial<Record<AdminTab, number>>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isActiveGroup = group.items.some((item) => item.id === activeTab)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, onClose])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold transition ${
          isActiveGroup ? 'mm-btn-primary' : 'mm-btn-secondary'
        }`}
        aria-expanded={open}
      >
        {group.label}
        <span className="text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-xl border border-white/10 mm-bg-surface-card p-1.5 shadow-xl">
          {group.items.map((item) => (
            <NavItemButton
              key={item.id}
              item={item}
              mapId={mapId}
              active={item.id === activeTab}
              badge={badgeForItem(item, badges)}
              onSelect={() => {
                if (item.id !== 'setup') onTabChange(item.id)
                onClose()
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function MemoryMapAdminNav({ mapId, activeTab, onTabChange, canManageSettings = true, badges }: Props) {
  const activeGroup = groupForTab(activeTab)
  const navGroups = navGroupsForAccess(canManageSettings)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="border-b border-white/10 px-4 py-3" aria-label="Admin sections">
      {/* Desktop: grouped dropdowns */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {navGroups.map((group) => (
          <GroupDropdown
            key={group.id}
            group={group}
            mapId={mapId}
            activeTab={activeTab}
            open={openGroupId === group.id}
            onToggle={() => setOpenGroupId((id) => (id === group.id ? null : group.id))}
            onClose={() => setOpenGroupId(null)}
            onTabChange={onTabChange}
            badges={badges}
          />
        ))}
      </div>

      {/* Mobile: section picker */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="mm-btn-secondary flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-bold"
        >
          <span>
            <span className="mm-muted block text-[10px] font-semibold uppercase tracking-wide">Admin section</span>
            {activeGroup.label} — {labelForTab(activeTab)}
          </span>
          <span className="text-white/50" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      {/* Active section breadcrumb (desktop) */}
      <p className="mm-muted mt-2 hidden text-xs md:block">
        {activeGroup.label} · <span className="text-white/80">{labelForTab(activeTab)}</span>
      </p>

      {/* Mobile sheet */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-white/10 mm-bg-surface-card p-4 mm-safe-bottom">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black">Admin sections</p>
              <button type="button" onClick={() => setMobileOpen(false)} className="text-xs font-bold text-white/60">
                Close
              </button>
            </div>
            <div className="space-y-4">
              {navGroups.map((group) => (
                <div key={group.id}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-white/50">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavItemButton
                        key={item.id}
                        item={item}
                        mapId={mapId}
                        active={item.id === activeTab}
                        badge={badgeForItem(item, badges)}
                        onSelect={() => {
                          if (item.id !== 'setup') onTabChange(item.id)
                          setMobileOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
