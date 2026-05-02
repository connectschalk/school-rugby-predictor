import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { rpcScorePredictionsForMatch } from '@/lib/score-predictions-for-match'

export const runtime = 'nodejs'

async function fetchMatchIdsForTable(
  supabase: SupabaseClient,
  table: 'user_predictions' | 'user_prediction_scores',
  eligibleMatchIds: Set<string>
): Promise<Set<string>> {
  const out = new Set<string>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('match_id').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const r of data) {
      const id = (r as { match_id: string }).match_id
      if (eligibleMatchIds.has(id)) out.add(id)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const reqUrl = new URL(request.url)
  const onlyUnscored = reqUrl.searchParams.get('only_unscored') !== '0'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured' }, { status: 500 })
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { isAdmin, error: roleErr } = await fetchUserIsAdmin(supabase, user.id)
  if (roleErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { data: completedRows, error: gmErr } = await supabase
      .from('game_matches')
      .select('id')
      .eq('status', 'completed')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)

    if (gmErr) {
      return NextResponse.json({ ok: false, error: gmErr.message }, { status: 500 })
    }

    const eligibleMatchIds = new Set((completedRows ?? []).map((r) => (r as { id: string }).id))

    const [withPredictions, withScores] = await Promise.all([
      fetchMatchIdsForTable(supabase, 'user_predictions', eligibleMatchIds),
      fetchMatchIdsForTable(supabase, 'user_prediction_scores', eligibleMatchIds),
    ])

    const targets: string[] = []
    if (onlyUnscored) {
      for (const mid of withPredictions) {
        if (!withScores.has(mid)) targets.push(mid)
      }
    } else {
      targets.push(...withPredictions)
    }

    const scoringErrors: string[] = []
    let rpc_ok = 0
    for (const matchId of targets) {
      const { error } = await rpcScorePredictionsForMatch(supabase, matchId)
      if (error) scoringErrors.push(`${matchId}: ${error.message}`)
      else rpc_ok += 1
    }

    return NextResponse.json({
      ok: true,
      only_unscored: onlyUnscored,
      match_ids_attempted: targets.length,
      matches_scored_ok: rpc_ok,
      scoring_errors: scoringErrors,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
