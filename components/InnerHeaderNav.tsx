'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import CommunityPicksIcon from '@/components/icons/CommunityPicksIcon'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mobileMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    let cancelled = false
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

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeMobileMore = useCallback(() => setMobileMoreOpen(false), [])

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

  const rankingsActive = pathname.startsWith('/user-rankings')
  const predictActive = pathname.startsWith('/predict-score')
  const communityActive =
    pathname.startsWith('/community-predictor') || pathname.startsWith('/community-picks')
  const activeDot = (
    <span
      className="absolute -bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-600"
      aria-hidden
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
      <Link
        href="/"
        className="flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        onClick={() => {
          closeMenu()
          closeMobileMore()
        }}
      >
        <Image
          src="/nextplay-predictor.png"
          alt="NextPlay Predictor"
          width={160}
          height={54}
          className="h-10 w-auto sm:h-11"
          priority
        />
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:gap-4">
        <nav className="flex items-center gap-3 sm:gap-4" aria-label="Main">
          <div className="relative flex flex-col items-center pb-3">
            <Link
              href="/predict-score"
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
              href="/community-predictor"
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
              href="/user-rankings"
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
              <Link
                href="/community-predictor"
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMore}
              >
                <CommunityPicksIcon />
                Community Picks
              </Link>
              <Link
                href="/user-rankings"
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMore}
              >
                <RankingsListIcon />
                Rankings
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
                  avatarUrl={profile?.avatar_url}
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
                    href="/"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={closeMenu}
                  >
                    Home
                  </Link>
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
                    href="/predict-score?how=1"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-700"
                    onClick={closeMenu}
                  >
                    How it works
                  </Link>
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
