'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchMatchCommentsWithAuthors,
  insertMatchComment,
  type MatchCommentWithAuthor,
} from '@/lib/game-match-comments'
import { supabase } from '@/lib/supabase'

type Props = {
  matchId: string
  signedIn: boolean
  userId: string | null
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function MatchBanter({ matchId, signedIn, userId }: Props) {
  const [rows, setRows] = useState<MatchCommentWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { rows: next, error: e } = await fetchMatchCommentsWithAuthors(supabase, matchId)
    if (e) {
      const msg = e.message.toLowerCase()
      const missingTable =
        msg.includes('game_match_comments') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      setError(
        missingTable
          ? 'Match comments are not available yet. Apply the Supabase migration that creates public.game_match_comments, then reload this page.'
          : e.message
      )
      setRows([])
    } else {
      setRows(next)
    }
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    void load()
  }, [load])

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!signedIn || !userId || posting) return
    setPosting(true)
    setError('')
    const { error: insErr } = await insertMatchComment(supabase, matchId, userId, draft)
    if (insErr) {
      setError(insErr.message)
      setPosting(false)
      return
    }
    setDraft('')
    await load()
    setPosting(false)
  }

  return (
    <div className="mt-8 border-t border-gray-100 pt-6">
      <h3 className="text-sm font-semibold text-gray-900">Banter</h3>
      <p className="mt-1 text-xs text-gray-500">
        Keep it friendly — school rugby vibes only.
      </p>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50/80 p-3">
        {loading ? (
          <p className="text-xs text-gray-500">Loading comments…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-500">No comments yet. Start the thread.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                {r.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatar_url}
                    alt=""
                    className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {r.display_name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-gray-900">{r.display_name}</span>
                    <span className="text-xs text-gray-400">{formatTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
                    {r.body}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {signedIn && userId ? (
        <form onSubmit={(e) => void handlePost(e)} className="mt-4 space-y-2">
          <label htmlFor={`banter-${matchId}`} className="sr-only">
            Add a comment
          </label>
          <textarea
            id={`banter-${matchId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Chirp, respectfully…"
            className="w-full resize-y rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">{draft.length}/500</span>
            <button
              type="submit"
              disabled={posting || !draft.trim()}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-center">
          <p className="text-sm font-medium text-gray-900">Sign in to join the banter</p>
          <p className="mt-1 text-xs text-gray-600">
            You can read comments without an account. Posting requires a signed-in player.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  )
}
