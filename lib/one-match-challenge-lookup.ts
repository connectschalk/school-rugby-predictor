import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { OneMatchChallengeRow, OneMatchMatchRow } from '@/lib/one-match-challenge'
import { SUPABASE_PUBLIC } from '@/lib/supabase-public-access'

export type OneMatchChallengeLookup = {
  challenge: OneMatchChallengeRow
  match: OneMatchMatchRow
}

type RpcPayload = {
  challenge: OneMatchChallengeRow
  match: OneMatchMatchRow | null
}

/** Normalize slug from URL params (trim, safe decode). */
export function normalizeOneMatchSlug(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) {
      s = decodeURIComponent(s)
    }
  } catch {
    /* keep original */
  }
  return s.trim()
}

export function createOneMatchAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function logLookup(
  context: string | undefined,
  info: Record<string, unknown>
) {
  console.info('[one-match-lookup]', { context: context ?? 'unknown', ...info })
}

function parseRpcPayload(data: unknown): RpcPayload | null {
  if (!data || typeof data !== 'object') return null
  const root = data as RpcPayload
  if (!root.challenge?.id || !root.challenge.slug) return null
  return root
}

async function lookupViaRpc(
  supabase: SupabaseClient,
  normalizedSlug: string
): Promise<{ payload: RpcPayload | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_one_match_challenge_by_slug', {
    p_slug: normalizedSlug,
  })

  if (error) {
    return { payload: null, error: error.message }
  }

  return { payload: parseRpcPayload(data), error: null }
}

/** Direct queries (no embed) — fallback when RPC is not deployed yet. */
async function lookupViaDirectQueries(
  supabase: SupabaseClient,
  normalizedSlug: string
): Promise<{ payload: RpcPayload | null; error: string | null }> {
  const { data: challenge, error: chErr } = await supabase
    .from('one_match_challenges')
    .select('id, slug, match_id, is_active, created_at, created_by')
    .eq('slug', normalizedSlug)
    .maybeSingle()

  if (chErr) {
    return { payload: null, error: chErr.message }
  }
  if (!challenge) {
    return { payload: null, error: null }
  }

  const { data: match, error: gmErr } = await supabase
    .from(SUPABASE_PUBLIC.gameMatches)
    .select('id, home_team, away_team, kickoff_time, status, home_score, away_score')
    .eq('id', challenge.match_id)
    .maybeSingle()

  if (gmErr) {
    return { payload: null, error: gmErr.message }
  }

  return {
    payload: {
      challenge: challenge as OneMatchChallengeRow,
      match: (match as OneMatchMatchRow | null) ?? null,
    },
    error: null,
  }
}

/**
 * Find a one-match challenge by slug (same logic for page, metadata, and OG image).
 * Does not filter on kickoff, predictions closed, or is_active (RPC reads any row by slug).
 */
export async function getOneMatchChallengeBySlug(
  slug: string,
  options?: { logContext?: string; supabase?: SupabaseClient }
): Promise<OneMatchChallengeLookup | null> {
  const normalizedSlug = normalizeOneMatchSlug(slug)
  if (!normalizedSlug) {
    logLookup(options?.logContext, { requestedSlug: slug, normalizedSlug, found: false, reason: 'empty_slug' })
    return null
  }

  const supabase = options?.supabase ?? createOneMatchAnonClient()
  if (!supabase) {
    logLookup(options?.logContext, { requestedSlug: slug, normalizedSlug, found: false, reason: 'no_supabase_env' })
    return null
  }

  let rpcResult = await lookupViaRpc(supabase, normalizedSlug)
  if (rpcResult.error?.includes('Could not find the function')) {
    rpcResult = await lookupViaDirectQueries(supabase, normalizedSlug)
  } else if (!rpcResult.payload && !rpcResult.error) {
    rpcResult = await lookupViaDirectQueries(supabase, normalizedSlug)
  }

  const { payload, error } = rpcResult

  if (error) {
    logLookup(options?.logContext, {
      requestedSlug: slug,
      normalizedSlug,
      found: false,
      queryError: error,
    })
    return null
  }

  if (!payload?.match) {
    logLookup(options?.logContext, {
      requestedSlug: slug,
      normalizedSlug,
      found: false,
      challengeId: payload?.challenge?.id ?? null,
      reason: payload?.challenge ? 'match_row_missing' : 'challenge_not_found',
    })
    return null
  }

  logLookup(options?.logContext, {
    requestedSlug: slug,
    normalizedSlug,
    found: true,
    challengeId: payload.challenge.id,
    matchId: payload.match.id,
    isActive: payload.challenge.is_active,
    homeTeam: payload.match.home_team,
    awayTeam: payload.match.away_team,
  })

  return { challenge: payload.challenge, match: payload.match }
}
