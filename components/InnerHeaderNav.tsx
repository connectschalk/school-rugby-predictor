'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

function initialsForUser(user: User, displayName: string | null | undefined): string {
  const name = (displayName ?? '').trim() || (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '')
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      const a = parts[0][0]
      const b = parts[parts.length - 1][0]
      if (a && b) return (a + b).toUpperCase()
    }
    const w = parts[0] ?? name
    return w.slice(0, 2).toUpperCase() || '?'
  }
  const email = user.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

export default function InnerHeaderNav() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(
    null
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return
        setProfile(data as { display_name: string | null; avatar_url: string | null } | null)
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

  const closeMenu = useCallback(() => setMenuOpen(false), [])

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
  const avatarUrl = profile?.avatar_url?.trim() || null
  const initials = user ? initialsForUser(user, profile?.display_name) : ''

  const btnBase =
    'inline-flex items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-4 px-4 py-4 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      {/* Logo / app name → home */}
      <Link
        href="/"
        className="col-start-1 row-start-1 flex shrink-0 items-center gap-3"
        onClick={closeMenu}
      >
        <Image
          src="/nextplay-predictor.png"
          alt="NextPlay Predictor"
          width={160}
          height={54}
          className="h-10 w-auto sm:h-11"
          priority
        />
        <span className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">NextPlay</span>
      </Link>

      {/* Main nav — Predict, Rankings (/tools not in nav) */}
      <nav
        className="col-span-2 row-start-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:border-t-0 lg:pt-0"
        aria-label="Main"
      >
        <Link href="/predict-score" className="hover:text-teal-900 hover:underline" onClick={closeMenu}>
          Predict
        </Link>
        <Link href="/user-rankings" className="hover:text-teal-900 hover:underline" onClick={closeMenu}>
          Rankings
        </Link>
      </nav>

      {/* Auth: same cell desktop top-right; mobile top-right next to logo */}
      <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
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
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-white px-2 py-1.5 pl-2 pr-3 text-left hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                    width={36}
                    height={36}
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white ring-1 ring-teal-900"
                    aria-hidden
                  >
                    {initials}
                  </span>
                )}
                <span className="max-w-[10rem] truncate text-sm font-semibold text-gray-900">{displayName}</span>
                <span className="text-gray-500" aria-hidden>
                  ▾
                </span>
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-52 rounded-xl border-2 border-gray-200 bg-white py-1 shadow-lg"
                >
                  <Link
                    role="menuitem"
                    href="/"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={closeMenu}
                  >
                    Home
                  </Link>
                  <Link
                    role="menuitem"
                    href="/profile"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={closeMenu}
                  >
                    Profile
                  </Link>
                  <Link
                    role="menuitem"
                    href="/predict-score?how=1"
                    className="block px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={closeMenu}
                  >
                    How it works
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-800 hover:bg-red-50"
                    onClick={() => void signOut()}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/login"
                className={`${btnBase} border-gray-900 bg-white text-gray-900 hover:bg-gray-50 focus-visible:outline-gray-900`}
                onClick={closeMenu}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={`${btnBase} border-teal-950 bg-teal-800 text-white hover:bg-teal-900 focus-visible:outline-teal-950`}
                onClick={closeMenu}
              >
                Sign up
              </Link>
            </div>
        )}
      </div>
    </div>
  )
}
