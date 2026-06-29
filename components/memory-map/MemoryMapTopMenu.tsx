'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMemoryMapPlatformAdmin } from '@/lib/admin-access'
import {
  buildMemoryMapSignInHref,
  buildMemoryMapSignUpHref,
  currentPathWithSearch,
  MEMORY_MAP_ACCOUNT_PATH,
  parseMemoryMapAdminIdFromPath,
  parseMemoryMapSlugFromPath,
} from '@/lib/memory-map/auth-routes'
import { fetchAdminOrganisationsForUser, organisationDashboardPath } from '@/lib/memory-map/organisations'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import {
  roleBadgeForGlobalAccess,
  roleBadgeForMapAccess,
  type MemoryMapRoleBadge,
} from '@/lib/memory-map/menu-role'
import { userHasAdminDashboardAccess } from '@/lib/memory-map/my-maps'
import { fetchMemoryMapProfile } from '@/lib/memory-map/user-profile'
import { supabase } from '@/lib/supabase'

type MenuProfile = {
  displayName: string | null
  email: string | null
}

export default function MemoryMapTopMenu() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const returnPath = useMemo(
    () => currentPathWithSearch(pathname, searchParams),
    [pathname, searchParams]
  )

  const mapSlug = parseMemoryMapSlugFromPath(pathname)
  const adminMapId = parseMemoryMapAdminIdFromPath(pathname)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [profile, setProfile] = useState<MenuProfile>({ displayName: null, email: null })
  const [roleBadge, setRoleBadge] = useState<MemoryMapRoleBadge | null>(null)
  const [showAdminLink, setShowAdminLink] = useState(false)
  const [organisationDashboardHref, setOrganisationDashboardHref] = useState<string | null>(null)

  const loadMenuState = useCallback(async () => {
    setLoading(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user ?? null

    if (!user) {
      setSignedIn(false)
      setProfile({ displayName: null, email: null })
      setRoleBadge(null)
      setShowAdminLink(false)
      setOrganisationDashboardHref(null)
      setLoading(false)
      return
    }

    setSignedIn(true)
    setProfile({
      displayName: null,
      email: user.email ?? null,
    })

    const [{ profile: mmProfile }, { isAdmin: isAppAdmin }, adminOrgsRes] = await Promise.all([
      fetchMemoryMapProfile(supabase, user.id),
      fetchMemoryMapPlatformAdmin(supabase, user.id),
      fetchAdminOrganisationsForUser(supabase, user.id),
    ])

    const menuName = mmProfile?.display_name?.trim() || mmProfile?.contributor_name?.trim()
    if (menuName) {
      setProfile((prev) => ({ ...prev, displayName: menuName }))
    }

    let resolvedMapId = adminMapId
    if (!resolvedMapId && mapSlug) {
      const { data: mapRow } = await supabase.from('memory_maps').select('id').eq('slug', mapSlug).maybeSingle()
      resolvedMapId = mapRow?.id ? String(mapRow.id) : null
    }

    if (resolvedMapId) {
      const access = await fetchContributorAccess(supabase, resolvedMapId)
      setRoleBadge(roleBadgeForMapAccess(access))
    } else {
      const hasAdminMaps = await userHasAdminDashboardAccess(supabase)
      const isOrgAdmin = !isAppAdmin && (adminOrgsRes.organisations.length > 0)
      setRoleBadge(
        roleBadgeForGlobalAccess({
          isAppAdmin,
          isOrgAdmin,
          hasAccessibleMaps: hasAdminMaps,
        })
      )
    }

    setShowAdminLink(isAppAdmin)
    const primaryOrg = adminOrgsRes.organisations[0]
    setOrganisationDashboardHref(
      !isAppAdmin && primaryOrg ? organisationDashboardPath(primaryOrg.slug) : null
    )
    setLoading(false)
  }, [adminMapId, mapSlug])

  useEffect(() => {
    void loadMenuState()
  }, [loadMenuState])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadMenuState()
    })
    return () => sub.subscription.unsubscribe()
  }, [loadMenuState])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function onSignOut() {
    setOpen(false)
    await supabase.auth.signOut()
    if (mapSlug) {
      router.push(`/memory-map/${mapSlug}`)
    } else {
      router.push('/memory-map')
    }
    router.refresh()
  }

  const addMemoryHref = mapSlug ? `/memory-map/${mapSlug}/add` : null

  return (
    <div className="mm-top-menu pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-end px-4 pt-3 mm-safe-top-sm">
      <div className="pointer-events-auto relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          aria-label="Memory Map menu"
          onClick={() => setOpen((v) => !v)}
          className="mm-top-menu-trigger flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-black/40 text-lg backdrop-blur-sm"
        >
          <span aria-hidden>{signedIn ? '☰' : '☰'}</span>
        </button>

        {open ? (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <div className="mm-top-menu-panel absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] rounded-2xl border border-white/15 bg-[var(--mm-surface-card,#111827)] p-4 shadow-2xl">
              <div className="border-b border-white/10 pb-3">
                <p className="mm-text-accent text-[10px] font-bold uppercase tracking-[0.2em]">NextPlay Memory Map</p>
                {loading ? (
                  <p className="mm-muted mt-2 text-sm">Loading account…</p>
                ) : signedIn ? (
                  <>
                    <p className="mt-2 text-sm font-bold">{profile.displayName ?? profile.email ?? 'Signed in'}</p>
                    {profile.displayName && profile.email ? (
                      <p className="mm-muted text-xs">{profile.email}</p>
                    ) : null}
                    {roleBadge ? (
                      <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
                        {roleBadge}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <p className="mm-muted mt-2 text-sm leading-relaxed">Sign in to add memories or manage your maps.</p>
                )}
              </div>

              <nav className="mt-3 space-y-1">
                {signedIn ? (
                  <>
                    <MenuLink href="/memory-map/my" onClick={() => setOpen(false)}>
                      My Memory Maps
                    </MenuLink>
                    <MenuLink href="/memory-map/find" onClick={() => setOpen(false)}>
                      Find a Memory Map
                    </MenuLink>
                    {addMemoryHref ? (
                      <MenuLink href={addMemoryHref} onClick={() => setOpen(false)}>
                        Add a memory
                      </MenuLink>
                    ) : null}
                    {organisationDashboardHref ? (
                      <MenuLink href={organisationDashboardHref} onClick={() => setOpen(false)}>
                        Organisation dashboard
                      </MenuLink>
                    ) : null}
                    {showAdminLink ? (
                      <MenuLink href="/memory-map/admin" onClick={() => setOpen(false)}>
                        Admin dashboard
                      </MenuLink>
                    ) : null}
                    <MenuLink href={MEMORY_MAP_ACCOUNT_PATH} onClick={() => setOpen(false)}>
                      Account
                    </MenuLink>
                    <button
                      type="button"
                      onClick={() => void onSignOut()}
                      className="mm-top-menu-item w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-300 hover:bg-white/5"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <MenuLink href={buildMemoryMapSignInHref(returnPath)} onClick={() => setOpen(false)}>
                      Sign in
                    </MenuLink>
                    <MenuLink href={buildMemoryMapSignUpHref(returnPath)} onClick={() => setOpen(false)}>
                      Create account
                    </MenuLink>
                    <MenuLink href="/memory-map/find" onClick={() => setOpen(false)}>
                      Find a Memory Map
                    </MenuLink>
                    <MenuLink href="/memory-map#about" onClick={() => setOpen(false)}>
                      About Memory Map
                    </MenuLink>
                  </>
                )}
              </nav>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link href={href} onClick={onClick} className="mm-top-menu-item block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/5">
      {children}
    </Link>
  )
}
