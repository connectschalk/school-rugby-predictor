'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import LetterAvatar from '@/components/LetterAvatar'
import MatchBanter from '@/components/predict-score/MatchBanter'
import { fetchDiscussionComments, type DiscussionCommentRow } from '@/lib/game-match-comments'
import { supabase } from '@/lib/supabase'

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function DiscussionPage() {
  const params = useSearchParams()
  const matchId = params.get('matchId')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rows, setRows] = useState<DiscussionCommentRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { rows: next, error } = await fetchDiscussionComments(supabase, { matchId })
    if (error) {
      setRows([])
      setLoadError(error.message)
    } else {
      setRows(next)
    }
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return rows
    return rows.filter((r) => {
      const gameTitle = `${r.home_team} vs ${r.away_team}`.toLowerCase()
      return (
        r.home_team.toLowerCase().includes(q) ||
        r.away_team.toLowerCase().includes(q) ||
        gameTitle.includes(q) ||
        r.body.toLowerCase().includes(q) ||
        r.display_name.toLowerCase().includes(q)
      )
    })
  }, [q, rows])

  const focusMatch = matchId ? rows.find((r) => r.match_id === matchId) ?? null : null

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
      <div className="text-center md:text-left">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">Discussion</h1>
        <p className="mt-2 text-sm text-gray-600">Follow the conversation across matches.</p>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 sm:p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-600">
            Search games or comments
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search games or comments"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          />
        </label>
      </div>

      {matchId && focusMatch ? (
        <section id="comments" className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-gray-900">Comments</h2>
            <Link
              href={`/predict-score/${focusMatch.match_id}`}
              className="text-xs font-semibold text-gray-700 underline decoration-red-600 underline-offset-2"
            >
              View match
            </Link>
          </div>
          <div className="mt-3">
            <MatchBanter matchId={focusMatch.match_id} signedIn={!!user} userId={user?.id ?? null} />
          </div>
        </section>
      ) : null}

      {loadError ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>
      ) : null}

      <section className="mt-8 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading discussion…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-gray-900">No comments yet</p>
            <p className="mt-1 text-sm text-gray-600">Be the first to comment</p>
          </div>
        ) : (
          filtered.map((r) => (
            <article key={r.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/predict-score/${r.match_id}`}
                    className="text-sm font-bold text-gray-900 underline decoration-red-600 underline-offset-2"
                  >
                    {r.home_team} vs {r.away_team}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-500">{fmtTime(r.kickoff_time)}</p>
                </div>
                <p className="shrink-0 text-xs text-gray-400">{fmtTime(r.created_at)}</p>
              </div>

              <div className="mt-3 flex items-start gap-2">
                <LetterAvatar
                  letter={r.avatar_letter}
                  colour={r.avatar_colour}
                  avatarUrl={r.avatar_url}
                  firstName={r.first_name}
                  displayName={r.display_name}
                  name={r.display_name}
                  size={32}
                  className="mt-0.5 ring-1 ring-gray-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{r.display_name}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{r.body}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
