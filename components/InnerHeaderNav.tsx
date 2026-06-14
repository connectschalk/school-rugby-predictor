'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ADMIN_AVATAR_SRC,
  PLATFORM_HOME_HREF,
  PLATFORM_LOGO_ALT,
  PLATFORM_LOGO_SRC,
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
import LetterAvatar from '@/components/LetterAvatar'
import CommunityPicksIcon from '@/components/icons/CommunityPicksIcon'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { supabase } from '@/lib/supabase'

function PredictIconDot() {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
}

function RankingsListIcon() {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 flex-col justify-center gap-[2px]" aria-hidden>
      <span className="h-[2px] w-full rounded-full bg-red-500" />
      <span className="h-[2px] w-full rounded-full bg-red-500" />
      <span className="h-[2px] w-full rounded-full bg-red-500" />
    </span>
  )
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

  const predictClasses = (active: boolean) =>
    [
      'inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-800 bg-[#111318] px-4 py-2 text-sm font-semibold text-white transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700',
      'hover:bg-[#1a1d24]',
      active ? 'scale-[1.02] shadow-[0_0_0_1px_rgba(239,68,68,0.18)]' : '',
    ].join(' ')

  const rankingsClasses = (active: boolean) =>
    [
      'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700',
      active
        ? 'border-gray-500 bg-gray-100 text-gray-900'
        : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50',
    ].join(' ')

  const btnBase =
    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700'

  const rankingsActive = isCompetitionNavActive(pathname, 'leaderboard')
  const poolsActive = isCompetitionNavActive(pathname, 'pools')
  const predictActive = isCompetitionNavActive(pathname, 'predict')
  const communityActive = isCompetitionNavActive(pathname, 'community')
  const competitionSlug = resolveCompetitionSlugFromPathname(pathname)
  const competitionLabel = competitionSwitcherLabel(competitionSlug)
  const predictHref = getCompetitionScopedHref(pathname, 'predict', competitionSlug)
  const communityHref = getCompetitionScopedHref(pathname, 'community', competitionSlug)
  const rankingsHref = getCompetitionScopedHref(pathname, 'leaderboard', competitionSlug)
  const poolsHref = getCompetitionScopedHref(pathname, 'pools', competitionSlug)
  const howItWorksHref = `${predictHref}?how=1`
  const activeDot = (
    <span
      className="absolute -bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-600"
      aria-hidden
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <Link
          href={PLATFORM_HOME_HREF}
          className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          onClick={() => {
            closeMenu()
            closeMobileMore()
            closeCompetitionMenu()
          }}
        >
          <Image
            src={PLATFORM_LOGO_SRC}
            alt={PLATFORM_LOGO_ALT}
            width={160}
            height={54}
            className="h-10 w-auto sm:h-11"
            priority
          />
        </Link>

        <div ref={competitionMenuRef} className="relative hidden sm:block">
          <button
            type="button"
            aria-expanded={competitionMenuOpen}
            aria-haspopup="listbox"
            onClick={() => {
              setMenuOpen(false)
              setMobileMoreOpen(false)
              setCompetitionMenuOpen((open) => !open)
            }}
            className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-left text-xs font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 md:max-w-[14rem] md:text-sm"
          >
            <span className="truncate">{competitionLabel}</span>
            <span className="text-gray-500" aria-hidden>
              ▾
            </span>
          </button>
          {competitionMenuOpen ? (
            <div
              role="listbox"
              aria-label="Choose competition"
              className="absolute left-0 z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-black/10"
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
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:gap-4">
        <nav className="flex items-center gap-3 sm:gap-4" aria-label="Main">
          <div className="relative flex flex-col items-center pb-3">
            <Link
              href={predictHref}
              className={predictClasses(predictActive)}
              onClick={() => {
                closeMenu()
                closeMobileMore()
              }}
            >
              <PredictIconDot />
              Predict
            </Link>
            {predictActive ? activeDot : null}
          </div>
          <div className="relative hidden flex-col items-center pb-3 md:flex">
            <Link
              href={communityHref}
              className={rankingsClasses(communityActive)}
              onClick={() => {
                closeMenu()
                closeMobileMore()
              }}
            >
              <CommunityPicksIcon />
              Community Picks
            </Link>
            {communityActive ? activeDot : null}
          </div>
          <div className="relative hidden flex-col items-center pb-3 md:flex">
            <Link
              href={rankingsHref}
              className={rankingsClasses(rankingsActive)}
              onClick={() => {
                closeMenu()
                closeMobileMore()
              }}
            >
              <RankingsListIcon />
              Rankings
            </Link>
            {rankingsActive ? activeDot : null}
          </div>
          <div className="relative hidden flex-col items-center pb-3 md:flex">
            <Link
              href={poolsHref}
              className={rankingsClasses(poolsActive)}
              onClick={() => {
                closeMenu()
                closeMobileMore()
              }}
            >
              <RankingsListIcon />
              Pools
            </Link>
            {poolsActive ? activeDot : null}
          </div>
        </nav>

        <div ref={mobileMoreRef} className="relative md:hidden">
          <button
            type="button"
            aria-expanded={mobileMoreOpen}
            aria-haspopup="true"
            aria-label="Open menu"
            onClick={() => {
              setMenuOpen(false)
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
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-md shadow-black/10">
              <p className="px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Competition
              </p>
              {COMPETITION_SWITCHER_OPTIONS.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  onClick={() => {
                    closeMobileMore()
                    router.push(getEquivalentCompetitionPath(pathname, option.slug))
                  }}
                  className={`block w-full px-4 py-2.5 text-left text-sm ${
                    option.slug === competitionSlug
                      ? 'bg-gray-100 font-bold text-gray-900'
                      : 'font-medium text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="my-1 border-t border-gray-100" />
              <Link
                href={communityHref}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMore}
              >
                <CommunityPicksIcon />
                Community Picks
              </Link>
              <Link
                href={rankingsHref}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMore}
              >
                <RankingsListIcon />
                Rankings
              </Link>
              <Link
                href={poolsHref}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMore}
              >
                <RankingsListIcon />
                Pools
              </Link>
              {!signedIn && authReady ? (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <Link
                    href="/login"
                    className="block px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    onClick={closeMobileMore}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="block px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
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
          className={`flex items-center gap-3 sm:gap-4 ${authReady ? 'md:ml-1 md:border-l md:border-gray-200 md:pl-5' : ''}`}
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
                className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-2 py-1.5 pl-2 pr-3 text-left hover:border-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              >
                <LetterAvatar
                  letter={profile?.avatar_letter}
                  colour={profile?.avatar_colour}
                  avatarUrl={isAdmin ? ADMIN_AVATAR_SRC : profile?.avatar_url}
                  firstName={profile?.first_name}
                  displayName={profile?.display_name}
                  name={displayName}
                  size={36}
                  className="ring-1 ring-gray-200"
                />
                <span className="max-w-[10rem] truncate text-sm font-semibold text-gray-900 max-md:hidden">
                  {displayName}
                </span>
                <span className="text-gray-500" aria-hidden>
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
            <div className="hidden items-center gap-3 sm:gap-4 md:flex">
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
