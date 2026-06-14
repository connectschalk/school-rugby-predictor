import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCompetitionImportKickoff } from '@/lib/admin-competition-import'
import type { Competition } from '@/lib/competitions'
import { getCompetitionBySlug } from '@/lib/competitions'
import type { GameMatchStatus } from '@/lib/public-prediction-game'

export type AdminFixtureRecord = {
  id: string
  competition_id: string
  kickoff_time: string
  home_team: string
  away_team: string
  status: GameMatchStatus
  home_score: number | null
  away_score: number | null
  external_id: string | null
  fixture_round: string | null
  league_group: string | null
  admin_notes: string | null
}

export function venueFromAdminNotes(notes: string | null | undefined): string {
  if (!notes?.trim()) return ''
  const match = notes.match(/^Venue:\s*(.+)$/im)
  return match?.[1]?.trim() ?? ''
}

export function buildAdminNotesFromVenue(venue?: string | null): string | null {
  const v = venue?.trim()
  return v ? `Venue: ${v}` : null
}

export function parseAdminKickoff(raw: string): string | null {
  return parseCompetitionImportKickoff(raw)
}

export function normalizeAdminMatchStatus(raw: string | null | undefined): GameMatchStatus | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s === 'completed' || s === 'final' || s === 'played') return 'completed'
  if (s === 'locked' || s === 'live') return 'locked'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (s === 'scheduled' || s === 'upcoming') return 'upcoming'
  return null
}

export function parseAdminScore(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.trunc(n)
}

type ResolveOk = { ok: true; competition: Competition; match: AdminFixtureRecord }
type ResolveErr = { ok: false; error: string; status: number }

export async function resolveCompetitionBySlug(
  client: SupabaseClient,
  competitionSlug: string
): Promise<{ competition: Competition | null; error: string | null; status: number }> {
  const slug = competitionSlug.trim().toLowerCase()
  if (!slug) return { competition: null, error: 'Missing competition slug', status: 400 }
  const { competition, error } = await getCompetitionBySlug(client, slug)
  if (error) return { competition: null, error, status: 500 }
  if (!competition) return { competition: null, error: 'Competition not found', status: 404 }
  return { competition, error: null, status: 200 }
}

export async function resolveCompetitionAdminMatch(
  client: SupabaseClient,
  competitionSlug: string,
  matchId: string
): Promise<ResolveOk | ResolveErr> {
  const { competition, error, status } = await resolveCompetitionBySlug(client, competitionSlug)
  if (!competition) return { ok: false, error: error ?? 'Competition not found', status }

  const id = matchId.trim()
  if (!id) return { ok: false, error: 'Missing match id', status: 400 }

  const { data, error: matchErr } = await client
    .from('game_matches')
    .select(
      'id, competition_id, kickoff_time, home_team, away_team, status, home_score, away_score, external_id, fixture_round, league_group, admin_notes'
    )
    .eq('id', id)
    .maybeSingle()

  if (matchErr) return { ok: false, error: matchErr.message, status: 500 }
  if (!data) return { ok: false, error: 'Fixture not found', status: 404 }
  if (String(data.competition_id) !== competition.id) {
    return { ok: false, error: 'Fixture does not belong to this competition', status: 403 }
  }

  const statusVal = data.status
  if (
    statusVal !== 'upcoming' &&
    statusVal !== 'locked' &&
    statusVal !== 'completed' &&
    statusVal !== 'cancelled'
  ) {
    return { ok: false, error: 'Invalid fixture status in database', status: 500 }
  }

  return {
    ok: true,
    competition,
    match: {
      id: String(data.id),
      competition_id: String(data.competition_id),
      kickoff_time: String(data.kickoff_time),
      home_team: String(data.home_team),
      away_team: String(data.away_team),
      status: statusVal,
      home_score: data.home_score != null ? Number(data.home_score) : null,
      away_score: data.away_score != null ? Number(data.away_score) : null,
      external_id: data.external_id != null ? String(data.external_id) : null,
      fixture_round: data.fixture_round != null ? String(data.fixture_round) : null,
      league_group: data.league_group != null ? String(data.league_group) : null,
      admin_notes: data.admin_notes != null ? String(data.admin_notes) : null,
    },
  }
}

export type FixtureWriteBody = {
  home_team?: string
  away_team?: string
  kickoff?: string
  venue?: string
  fixture_round?: string
  league_group?: string
  status?: string
  external_id?: string
}

export function buildFixtureUpdatePayload(
  body: FixtureWriteBody,
  existing?: Pick<AdminFixtureRecord, 'home_team' | 'away_team'>
): { payload: Record<string, unknown>; error: string | null } {
  const payload: Record<string, unknown> = {}

  if (body.home_team !== undefined) {
    const home = body.home_team.trim()
    if (!home) return { payload, error: 'home_team cannot be empty' }
    payload.home_team = home
  }
  if (body.away_team !== undefined) {
    const away = body.away_team.trim()
    if (!away) return { payload, error: 'away_team cannot be empty' }
    payload.away_team = away
  }
  if (body.kickoff !== undefined) {
    const kickoffIso = parseAdminKickoff(body.kickoff)
    if (!kickoffIso) return { payload, error: 'Invalid kickoff datetime' }
    payload.kickoff_time = kickoffIso
  }
  if (body.status !== undefined) {
    const status = normalizeAdminMatchStatus(body.status)
    if (!status) return { payload, error: 'Invalid status' }
    payload.status = status
  }
  if (body.fixture_round !== undefined) {
    payload.fixture_round = body.fixture_round.trim() || null
  }
  if (body.league_group !== undefined) {
    payload.league_group = body.league_group.trim() || null
  }
  if (body.external_id !== undefined) {
    payload.external_id = body.external_id.trim() || null
  }
  if (body.venue !== undefined) {
    payload.admin_notes = buildAdminNotesFromVenue(body.venue)
  }

  const home = String(payload.home_team ?? existing?.home_team ?? '').trim()
  const away = String(payload.away_team ?? existing?.away_team ?? '').trim()
  if (home && away && home.toLowerCase() === away.toLowerCase()) {
    return { payload, error: 'home_team and away_team must differ' }
  }

  if (Object.keys(payload).length === 0) {
    return { payload, error: 'No fields to update' }
  }

  return { payload, error: null }
}

export function buildFixtureCreatePayload(
  body: FixtureWriteBody,
  competition: Competition
): { payload: Record<string, unknown>; error: string | null } {
  const home = body.home_team?.trim() ?? ''
  const away = body.away_team?.trim() ?? ''
  if (!home || !away) return { payload: {}, error: 'home_team and away_team are required' }
  if (home.toLowerCase() === away.toLowerCase()) {
    return { payload: {}, error: 'home_team and away_team must differ' }
  }
  const kickoffIso = body.kickoff ? parseAdminKickoff(body.kickoff) : null
  if (!kickoffIso) return { payload: {}, error: 'Valid kickoff is required' }

  const status = normalizeAdminMatchStatus(body.status) ?? 'upcoming'
  const payload: Record<string, unknown> = {
    competition_id: competition.id,
    home_team: home,
    away_team: away,
    kickoff_time: kickoffIso,
    status,
    verification_status: 'verified',
    source_type: 'admin_competition_import',
    source_name: `admin:${competition.slug}`,
  }

  const round = body.fixture_round?.trim()
  if (round) payload.fixture_round = round
  const group = body.league_group?.trim()
  if (group) payload.league_group = group
  const externalId = body.external_id?.trim()
  if (externalId) payload.external_id = externalId
  const notes = buildAdminNotesFromVenue(body.venue)
  if (notes) payload.admin_notes = notes

  return { payload, error: null }
}
