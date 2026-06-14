import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'
import {
  buildFixtureUpdatePayload,
  resolveCompetitionAdminMatch,
  type FixtureWriteBody,
} from '@/lib/admin-competition-fixture-api'

type RouteParams = { params: Promise<{ competitionSlug: string; matchId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  const { competitionSlug, matchId } = await params
  const resolved = await resolveCompetitionAdminMatch(auth.supabase, competitionSlug, matchId)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  let body: FixtureWriteBody
  try {
    body = (await request.json()) as FixtureWriteBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { payload, error: buildErr } = buildFixtureUpdatePayload(body, {
    home_team: resolved.match.home_team,
    away_team: resolved.match.away_team,
  })
  if (buildErr) {
    return NextResponse.json({ ok: false, error: buildErr }, { status: 400 })
  }

  const { error: upErr } = await auth.supabase
    .from('game_matches')
    .update(payload)
    .eq('id', resolved.match.id)
    .eq('competition_id', resolved.competition.id)

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    match_id: resolved.match.id,
    competition_slug: resolved.competition.slug,
  })
}
