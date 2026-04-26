import type { SupabaseClient } from '@supabase/supabase-js'

/** Rows in `public.game_match_comments` (see migration 007_game_match_comments.sql). */

export type GameMatchCommentRow = {
  id: string
  match_id: string
  user_id: string
  body: string
  created_at: string
}

export type MatchCommentWithAuthor = GameMatchCommentRow & {
  display_name: string
  first_name: string | null
  avatar_url: string | null
  avatar_letter: string | null
  avatar_colour: string | null
}

const MAX_BODY = 500

export function normalizeCommentBody(raw: string): string {
  const t = raw.trim()
  if (t.length > MAX_BODY) return t.slice(0, MAX_BODY)
  return t
}

export async function fetchMatchCommentsWithAuthors(
  client: SupabaseClient,
  matchId: string
): Promise<{ rows: MatchCommentWithAuthor[]; error: Error | null }> {
  const { data: comments, error } = await client
    .from('game_match_comments')
    .select('id, match_id, user_id, body, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  if (error) {
    return { rows: [], error: new Error(error.message) }
  }

  const list = (comments as GameMatchCommentRow[]) || []
  if (list.length === 0) {
    return { rows: [], error: null }
  }

  const ids = [...new Set(list.map((c) => c.user_id))]
  const { data: profiles, error: pErr } = await client
    .from('user_profiles')
    .select('id, display_name, first_name, avatar_url, avatar_letter, avatar_colour')
    .in('id', ids)

  if (pErr) {
    return { rows: [], error: new Error(pErr.message) }
  }

  const pm = new Map(
    (
      profiles as {
        id: string
        display_name: string
        first_name: string | null
        avatar_url: string | null
        avatar_letter: string | null
        avatar_colour: string | null
      }[] | null
    )?.map((p) => [p.id, p]) ?? []
  )

  const rows: MatchCommentWithAuthor[] = list.map((c) => {
    const p = pm.get(c.user_id)
    return {
      ...c,
      display_name: p?.display_name?.trim() || 'Player',
      first_name: p?.first_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      avatar_letter: p?.avatar_letter ?? null,
      avatar_colour: p?.avatar_colour ?? null,
    }
  })

  return { rows, error: null }
}

export async function insertMatchComment(
  client: SupabaseClient,
  matchId: string,
  userId: string,
  body: string
) {
  const bodyNorm = normalizeCommentBody(body)
  if (!bodyNorm) {
    return { error: new Error('Comment cannot be empty.') }
  }

  const { error } = await client.from('game_match_comments').insert({
    match_id: matchId,
    user_id: userId,
    body: bodyNorm,
  })

  return { error: error ? new Error(error.message) : null }
}
