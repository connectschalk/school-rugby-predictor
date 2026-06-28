'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  PLATFORM_HOME_HREF,
  PLATFORM_LOGO_ALT,
  PLATFORM_LOGO_SRC,
  resolveProfileAvatarUrl,
} from '@/lib/platform-branding'
import {
  COMPETITION_SWITCHER_OPTIONS,
  competitionSwitcherLabel,
  getCompetitionScopedHref,
  getEquivalentCompetitionPath,
  isCompetitionNavActive,
  resolveCompetitionSlugFromPathname,
} from '@/lib/competition-nav'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  CalendarDays,
  Layers,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import LetterAvatar from '@/components/LetterAvatar'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 shrink-0 stroke-[2] text-red-500" aria-hidden />
}

function navLinkClasses(active: boolean) {
  return [
    'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700',
    active
      ? 'border-gray-900 bg-gray-900 text-white hover:bg-black'
      : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50',
  ].join(' ')
}

function mobileNavLinkClasses(active: boolean) {
  return [
    'mx-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
    active ? 'bg-gray-900 text-white' : 'text-gray-900 hover:bg-gray-50',
  ].join(' ')
}

export default function InnerHeaderNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<{
    display_name: string | null
    avatar_url: string | null
    avatar_letter: string | null
    avatar_colour: string | null
    first_name: string | null
    surname: string | null
  } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [competitionMenuOpen, setCompetitionMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mobileMoreRef = useRef<HTMLDivElement>(null)
  const competitionMenuRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<User | null>(null)

  useEffect(() => {
    userRef.current = user
    console.log('AUTH USER SET', user?.id)
  }, [user])

  useEffect(() => {
    let cancelled = false
    const fallbackId = window.setTimeout(() => {
      if (cancelled) return
      setAuthReady(true)
    }, 5000)

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) console.error('InnerHeaderNav getSession error:', error)
        if (cancelled) return
        setUser(data.session?.user ?? null)
      } catch (err) {
        console.error('InnerHeaderNav getSession failed:', err)
      } finally {
        if (cancelled) return
        setAuthReady(true)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      console.log('AUTH EVENT', event, !!session?.user)
      setAuthReady(true)
      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }
      if (session?.user) {
        setUser(session.user)
        return
      }
      // Keep current user for non-signed-out null sessions.
      if (userRef.current) return
      setUser(null)
    })
    return () => {
      cancelled = true
      window.clearTimeout(fallbackId)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setIsAdmin(false)
      return
    }
    let cancelled = false
    void fetchUserIsAdmin(supabase, user.id).then(({ isAdmin: nextIsAdmin }) => {
      if (cancelled) return
      setIsAdmin(nextIsAdmin)
    })
    void supabase
      .from('user_profiles')
      .select('display_name, avatar_url, avatar_letter, avatar_colour, first_name, surname')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        setProfile(
          data as {
            display_name: string | null
            avatar_url: string | null
            avatar_letter: string | null
            avatar_colour: string | null
            first_name: string | null
            surname: string | null
          } | null
        )
      })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (!mobileMoreOpen) return
    function onPointerDown(e: PointerEvent) {
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(e.target as Node)) {
        setMobileMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [mobileMoreOpen])

  useEffect(() => {
    if (!competitionMenuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (competitionMenuRef.current && !competitionMenuRef.current.contains(e.target as Node)) {
        setCompetitionMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [competitionMenuOpen])

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeMobileMore = useCallback(() => setMobileMoreOpen(false), [])
  const closeCompetitionMenu = useCallback(() => setCompetitionMenuOpen(false), [])

  const signOut = async () => {
    closeMenu()
    await supabase.auth.signOut()
    router.refresh()
  }

  const signedIn = !!user
  const displayName =
    profile?.display_name?.trim() ||
    (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    user?.email?.split('@')[0]?.trim() ||
    'Account'
  const fullNameLine = [profile?.first_name?.trim(), profile?.surname?.trim()].filter(Boolean).join(' ')

  const btnBase =
    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700'

  const rankingsActive = isCompetitionNavActive(pathname, 'leaderboard')
  const poolsActive = isCompetitionNavActive(pathname, 'pools')
  const predictActive = isCompetitionNavActive(pathname, 'predict')
  const communityActive = isCompetitionNavActive(pathname, 'community')
  const fixturesActive = isCompetitionNavActive(pathname, 'fixtures')
  const competitionSlug = resolveCompetitionSlugFromPathname(pathname)
  const competitionLabel = competitionSwitcherLabel(competitionSlug)
  const predictHref = getCompetitionScopedHref(pathname, 'predict', competitionSlug)
  const communityHref = getCompetitionScopedHref(pathname, 'community', competitionSlug)
  const fixturesHref = getCompetitionScopedHref(pathname, 'fixtures', competitionSlug)
  const rankingsHref = getCompetitionScopedHref(pathname, 'leaderboard', competitionSlug)
  const poolsHref = getCompetitionScopedHref(pathname, 'pools', competitionSlug)
  const howItWorksHref = `${predictHref}?how=1`

  const mobileNavItems = [
    { href: predictHref, label: 'Predict', icon: Target, active: predictActive },
    { href: communityHref, label: 'Community Picks', icon: Users, active: communityActive },
    { href: fixturesHref, label: 'Fixtures', icon: CalendarDays, active: fixturesActive },
    { href: rankingsHref, label: 'Rankings', icon: Trophy, active: rankingsActive },
    { href: poolsHref, label: 'Pools', icon: Layers, active: poolsActive },
  ] as const

  return (
    <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-4 sm:gap-3 sm:px-6 lg:gap-4">
      <Link
        href={PLATFORM_HOME_HREF}
        className="flex h-11 shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        onClick={() => {
          closeMenu()
          closeMobileMore()
          closeCompetitionMenu()
        }}
      >
        <Image
          src={PLATFORM_LOGO_SRC}
          alt={PLATFORM_LOGO_ALT}
          width={192}
          height={64}
          className="h-11 w-auto origin-left scale-[1.14]"
          priority
        />
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <div
          ref={competitionMenuRef}
          className="relative hidden min-w-0 flex-1 sm:block sm:max-w-[11rem] sm:flex-none md:max-w-[12rem] lg:max-w-[11rem]"
        >
          <button
            type="button"
            aria-expanded={competitionMenuOpen}
            aria-haspopup="listbox"
            onClick={() => {
              setMenuOpen(false)
              setMobileMoreOpen(false)
              setCompetitionMenuOpen((open) => !open)
            }}
            className="inline-flex w-full max-w-full items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-3 py-2 text-left text-xs font-semibold text-gray-800 hover:bg-gray-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 md:text-sm"
          >
            <span className="truncate">{competitionLabel}</span>
            <span className="shrink-0 text-gray-500" aria-hidden>
              ▾
            </span>
          </button>
          {competitionMenuOpen ? (
            <div
              role="listbox"
              aria-label="Choose competition"
              className="absolute left-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-black/10"
            >
              {COMPETITION_SWITCHER_OPTIONS.map((option) => {
                const selected = option.slug === competitionSlug
                return (
                  <button
                    key={option.slug}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      closeCompetitionMenu()
                      router.push(getEquivalentCompetitionPath(pathname, option.slug))
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm ${
                      selected
                        ? 'bg-gray-100 font-bold text-gray-900'
                        : 'font-medium text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <nav className="hidden min-w-0 items-center gap-2 lg:flex lg:gap-3" aria-label="Main">
          {mobileNavItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={navLinkClasses(item.active)}
              onClick={() => {
                closeMenu()
                closeMobileMore()
              }}
            >
              <NavIcon icon={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div ref={mobileMoreRef} className="relative lg:hidden">
          <button
            type="button"
            aria-expanded={mobileMoreOpen}
            aria-haspopup="true"
            aria-label="Open menu"
            onClick={() => {
              setMenuOpen(false)
              setCompetitionMenuOpen(false)
              setMobileMoreOpen((o) => !o)
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <span className="flex flex-col gap-1" aria-hidden>
              <span className="block h-0.5 w-5 rounded-full bg-gray-800" />
              <span className="block h-0.5 w-5 rounded-full bg-gray-800" />
              <span className="block h-0.5 w-5 rounded-full bg-gray-800" />
            </span>
          </button>
          {mobileMoreOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white py-2 shadow-md shadow-black/10">
              <p className="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:hidden">
                Competition
              </p>
              <div className="space-y-0.5 sm:hidden">
                {COMPETITION_SWITCHER_OPTIONS.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    onClick={() => {
                      closeMobileMore()
                      router.push(getEquivalentCompetitionPath(pathname, option.slug))
                    }}
                    className={`mx-2 block w-[calc(100%-1rem)] rounded-lg px-3 py-2 text-left text-sm ${
                      option.slug === competitionSlug
                        ? 'bg-gray-100 font-bold text-gray-900'
                        : 'font-medium text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="my-1 border-t border-gray-100 sm:hidden" />
              <p className="px-4 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Menu
              </p>
              <div className="space-y-0.5">
                {mobileNavItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={mobileNavLinkClasses(item.active)}
                    onClick={closeMobileMore}
                  >
                    <NavIcon icon={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </div>
              {!signedIn && authReady ? (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <Link
                    href="/login"
                    className="mx-2 block rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    onClick={closeMobileMore}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="mx-2 block rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    onClick={closeMobileMore}
                  >
                    Sign up
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className={`flex items-center gap-2 ${authReady ? 'lg:ml-1 lg:border-l lg:border-gray-200 lg:pl-4' : ''}`}
        >
          {!authReady ? (
            <span className="text-xs text-gray-400" aria-hidden>
              …
            </span>
          ) : signedIn ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setMobileMoreOpen(false)
                  setMenuOpen((o) => !o)
                }}
                className="flex h-10 items-center gap-2 rounded-full border border-gray-300 bg-white p-1.5 text-left hover:border-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 lg:px-2 lg:py-1.5 lg:pl-2 lg:pr-3"
              >
                <LetterAvatar
                  letter={profile?.avatar_letter}
                  colour={profile?.avatar_colour}
                  avatarUrl={resolveProfileAvatarUrl(profile?.avatar_url, isAdmin)}
                  firstName={profile?.first_name}
                  displayName={profile?.display_name}
                  name={displayName}
                  size={32}
                  className="ring-1 ring-gray-200"
                />
                <span className="max-w-[10rem] truncate text-sm font-semibold text-gray-900 max-lg:hidden">
                  {displayName}
                </span>
                <span className="text-gray-500 max-lg:hidden" aria-hidden>
                  ▾
                </span>
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-black/5"
                >
                  <div className="border-b border-gray-100 px-4 py-2">
                    <p className="truncate text-sm font-semibold text-gray-900">{displayName}</p>
                    {fullNameLine ? (
                      <p className="truncate text-xs text-gray-500">{fullNameLine}</p>
                    ) : null}
                  </div>
                  <Link
                    role="menuitem"
                    href="/profile"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={closeMenu}
                  >
                    Profile
                  </Link>
                  <Link
                    role="menuitem"
                    href={howItWorksHref}
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={closeMenu}
                  >
                    How it works
                  </Link>
                  <Link
                    role="menuitem"
                    href="/"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={closeMenu}
                  >
                    Home
                  </Link>
                  {isAdmin ? (
                    <Link
                      role="menuitem"
                      href="/admin"
                      className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                      onClick={closeMenu}
                    >
                      Admin
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={() => void signOut()}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/login"
                className={`${btnBase} border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50`}
                onClick={closeMenu}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={`${btnBase} border-gray-900 bg-gray-900 text-white hover:bg-black`}
                onClick={closeMenu}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
