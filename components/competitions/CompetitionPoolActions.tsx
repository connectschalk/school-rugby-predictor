'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  findPoolByJoinCode,
  isPoolJoinRequestAlreadySentError,
  requestJoinPool,
  type PoolSearchRow,
} from '@/lib/pools'
import {
  formatPoolJoinCodeDisplay,
  validatePoolJoinCodeInput,
} from '@/lib/pool-join-code'
import { supabase } from '@/lib/supabase'

export type CompetitionPoolActionsProps = {
  competitionSlug: string
  competitionName: string
  competitionId: string
}

export default function CompetitionPoolActions({
  competitionSlug,
  competitionName,
  competitionId,
}: CompetitionPoolActionsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createPoolPath = `/competitions/${competitionSlug}/pools/create`
  const returnPath = `/competitions/${competitionSlug}`

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [joining, setJoining] = useState(false)
  const [inputError, setInputError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [preview, setPreview] = useState<PoolSearchRow | null>(null)
  const [crossCompetitionPool, setCrossCompetitionPool] = useState<PoolSearchRow | null>(null)
  const [joinMessage, setJoinMessage] = useState('')
  const autoSearchDone = useRef(false)

  const resetSearchState = useCallback(() => {
    setInputError('')
    setSearchError('')
    setNotFound(false)
    setPreview(null)
    setCrossCompetitionPool(null)
    setJoinMessage('')
  }, [])

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
    const fromUrl = searchParams.get('joinCode')?.trim()
    if (fromUrl) setJoinCode(fromUrl)
  }, [searchParams])

  useEffect(() => {
    const fromUrl = searchParams.get('joinCode')?.trim()
    if (!fromUrl || autoSearchDone.current) return
    if (validatePoolJoinCodeInput(fromUrl)) return
    autoSearchDone.current = true
    void (async () => {
      resetSearchState()
      setSearching(true)
      const { row, error, validationError } = await findPoolByJoinCode(supabase, fromUrl)
      setSearching(false)
      if (validationError && error) {
        setInputError(error)
        return
      }
      if (error) {
        setSearchError(error)
        return
      }
      if (!row) {
        setNotFound(true)
        return
      }
      const sameCompetition =
        row.competition_id === competitionId || row.competition_slug === competitionSlug
      if (!sameCompetition) {
        setCrossCompetitionPool(row)
        return
      }
      setPreview(row)
    })()
  }, [competitionId, competitionSlug, resetSearchState, searchParams])

  const onFindPool = useCallback(async () => {
    resetSearchState()
    const validation = validatePoolJoinCodeInput(joinCode)
    if (validation) {
      setInputError(validation)
      return
    }

    setSearching(true)
    const { row, error, validationError } = await findPoolByJoinCode(supabase, joinCode)
    setSearching(false)

    if (validationError && error) {
      setInputError(error)
      return
    }
    if (error) {
      setSearchError(error)
      return
    }
    if (!row) {
      setNotFound(true)
      return
    }

    const sameCompetition =
      row.competition_id === competitionId ||
      row.competition_slug === competitionSlug

    if (!sameCompetition) {
      setCrossCompetitionPool(row)
      return
    }

    setPreview(row)
  }, [competitionId, competitionSlug, joinCode, resetSearchState])

  async function onJoinPool(pool: PoolSearchRow) {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(returnPath)}`)
      return
    }

    setJoining(true)
    setJoinMessage('')
    setSearchError('')
    const { error, alreadySent } = await requestJoinPool(supabase, pool.id, {
      joinCode: pool.join_code,
    })
    setJoining(false)

    if (error) {
      if (alreadySent || isPoolJoinRequestAlreadySentError(error)) {
        setJoinMessage('Request already sent.')
      } else {
        setSearchError(error.message)
      }
      return
    }

    setJoinMessage('Request sent to pool admin.')
    router.push(`/competitions/${competitionSlug}/pools`)
  }

  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(returnPath)}`

  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-[#111318] p-5 sm:p-6">
        <h2 className="text-lg font-black text-white">Create a pool</h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-400">
          Start your own pool and invite friends.
        </p>
        <Link
          href={createPoolPath}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-700"
        >
          Create Pool
        </Link>
      </div>

      <div className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-[#111318] p-5 sm:p-6">
        <h2 className="text-lg font-black text-white">Join a pool</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          Enter a pool code shared by your group.
        </p>

        <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Enter pool code
        </label>
        <input
          type="text"
          value={joinCode}
          onChange={(e) => {
            setJoinCode(e.target.value)
            resetSearchState()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onFindPool()
          }}
          placeholder="WC0116"
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#0a0a0b] px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-white placeholder:text-gray-600 focus:border-red-500/50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />

        {inputError ? (
          <p className="mt-2 text-xs text-red-400">{inputError}</p>
        ) : null}

        <button
          type="button"
          disabled={searching || !joinCode.trim()}
          onClick={() => void onFindPool()}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {searching ? 'Searching…' : 'Find Pool'}
        </button>

        {notFound ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-300">
            No pool found for this code.
          </p>
        ) : null}

        {searchError ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
            {searchError}
          </p>
        ) : null}

        {crossCompetitionPool ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
            <p>
              This pool belongs to{' '}
              <strong className="font-bold">{crossCompetitionPool.competition_name}</strong>. Continue
              there?
            </p>
            <Link
              href={`/competitions/${crossCompetitionPool.competition_slug}?joinCode=${encodeURIComponent(joinCode.trim())}`}
              className="mt-3 inline-flex rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              Go to {crossCompetitionPool.competition_name}
            </Link>
          </div>
        ) : null}

        {preview ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#0a0a0b] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Pool preview</p>
            <p className="mt-1 text-base font-black text-white">{preview.name}</p>
            <dl className="mt-2 space-y-1 text-xs text-gray-400">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-gray-500">Competition</dt>
                <dd>{preview.competition_name}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-gray-500">Pool code</dt>
                <dd className="font-mono font-bold text-gray-200">
                  {formatPoolJoinCodeDisplay(preview.join_code)}
                </dd>
              </div>
              {preview.admin_display_name ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-gray-500">Admin</dt>
                  <dd>{preview.admin_display_name}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-gray-500">Members</dt>
                <dd>{preview.member_count}</dd>
              </div>
            </dl>

            {!authReady ? (
              <p className="mt-3 text-xs text-gray-500">Checking sign-in…</p>
            ) : !user ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={loginHref}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  Log in to join
                </Link>
                <Link
                  href={signupHref}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white hover:bg-white/5"
                >
                  Sign up
                </Link>
              </div>
            ) : (
              <button
                type="button"
                disabled={joining}
                onClick={() => void onJoinPool(preview)}
                className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {joining ? 'Joining…' : 'Join Pool'}
              </button>
            )}

            {joinMessage ? (
              <p className="mt-2 text-xs font-medium text-emerald-400">{joinMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
