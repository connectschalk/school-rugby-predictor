import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-api-auth'
import {
  buildFixtureCreatePayload,
  resolveCompetitionBySlug,
  type FixtureWriteBody,
} from '@/lib/admin-competition-fixture-api'

type RouteParams = { params: Promise<{ competitionSlug: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi(request)
  if (auth instanceof NextResponse) return auth

  const { competitionSlug } = await params
  const { competition, error, status } = await resolveCompetitionBySlug(auth.supabase, competitionSlug)
  if (!competition) {
    return NextResponse.json({ ok: false, error }, { status })
  }

  let body: FixtureWriteBody
  try {
    body = (await request.json()) as FixtureWriteBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { payload, error: buildErr } = buildFixtureCreatePayload(body, competition)
  if (buildErr) {
    return NextResponse.json({ ok: false, error: buildErr }, { status: 400 })
  }

  const { data, error: insErr } = await auth.supabase
    .from('game_matches')
    .insert(payload)
    .select('id')
    .single()

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    match_id: data?.id ?? null,
    competition_slug: competition.slug,
  })
}
