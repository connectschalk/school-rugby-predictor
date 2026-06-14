/**
 * Competition fixture ingest — documented pattern for Craven Week, Soccer World Cup, etc.
 *
 * ## Input shape (CSV / JSON rows)
 *
 * | Field            | Required | Notes |
 * |------------------|----------|-------|
 * | competition_slug | yes      | e.g. `craven-week`, `soccer-world-cup` |
 * | kickoff          | yes      | ISO 8601 or `YYYY-MM-DDTHH:mm` local |
 * | home_team        | yes      | Display name |
 * | away_team        | yes      | Display name |
 * | venue            | no       | Stored in `admin_notes` until a venue column exists |
 * | status           | no       | Defaults to `upcoming` (`scheduled` is accepted as alias) |
 *
 * ## Rules
 *
 * - Every row MUST resolve to a `competition_id` via `competition_slug`.
 * - Official competitions (`official_fixed_fixtures`) reject rows without `competition_id`.
 * - Schools sheet sync continues via `/api/admin/sync-master-sheet` and stamps `nextplay-schools`.
 * - Do not use the Schools sync path for Craven Week / Soccer World Cup fixtures.
 *
 * ## Next steps (no admin UI yet)
 *
 * 1. Prepare rows (CSV → `CompetitionFixtureInput[]`).
 * 2. Call `importCompetitionFixtures(client, rows)` with service-role or admin client.
 * 3. Verify on `/competitions/[slug]/fixtures`.
 * 4. Run scoring after results (`score_predictions_for_match`) when matches complete.
 *
 * Example CLI (future): `npx tsx scripts/import-competition-fixtures.ts fixtures/craven-week.json`
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCompetitionBySlug } from '@/lib/competitions'

export type CompetitionFixtureStatus = 'upcoming' | 'locked' | 'completed' | 'cancelled'

export type CompetitionFixtureInput = {
  competition_slug: string
  kickoff: string
  home_team: string
  away_team: string
  venue?: string | null
  /** `scheduled` is normalized to `upcoming`. */
  status?: CompetitionFixtureStatus | 'scheduled' | null
}

export type CompetitionFixtureRow = {
  competition_id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: CompetitionFixtureStatus
  admin_notes: string | null
  verification_status: 'verified'
}

export type ImportCompetitionFixturesResult = {
  inserted: number
  skipped: number
  errors: string[]
}

function normalizeStatus(raw: CompetitionFixtureInput['status']): CompetitionFixtureStatus {
  if (!raw || raw === 'scheduled') return 'upcoming'
  return raw
}

function parseKickoff(iso: string): string | null {
  const trimmed = iso.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Resolve slug → competition row; official comps must exist and be `official_fixed_fixtures`. */
export async function resolveCompetitionForIngest(
  client: SupabaseClient,
  slug: string
): Promise<{ competitionId: string; error: string | null }> {
  const normalized = slug.trim().toLowerCase()
  const { competition, error } = await getCompetitionBySlug(client, normalized)
  if (error) return { competitionId: '', error }
  if (!competition) return { competitionId: '', error: `Unknown competition slug: ${normalized}` }
  return { competitionId: competition.id, error: null }
}

/** Map ingest inputs to `game_matches` insert payloads (always includes `competition_id`). */
export async function buildCompetitionFixtureRows(
  client: SupabaseClient,
  inputs: CompetitionFixtureInput[]
): Promise<{ rows: CompetitionFixtureRow[]; errors: string[] }> {
  const errors: string[] = []
  const rows: CompetitionFixtureRow[] = []
  const slugToId = new Map<string, string>()

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]
    const slug = input.competition_slug?.trim().toLowerCase() ?? ''
    if (!slug) {
      errors.push(`Row ${i + 1}: competition_slug is required`)
      continue
    }

    let competitionId = slugToId.get(slug)
    if (!competitionId) {
      const resolved = await resolveCompetitionForIngest(client, slug)
      if (resolved.error || !resolved.competitionId) {
        errors.push(`Row ${i + 1}: ${resolved.error ?? 'Could not resolve competition'}`)
        continue
      }
      competitionId = resolved.competitionId
      slugToId.set(slug, competitionId)
    }

    const home = input.home_team?.trim() ?? ''
    const away = input.away_team?.trim() ?? ''
    if (!home || !away) {
      errors.push(`Row ${i + 1}: home_team and away_team are required`)
      continue
    }
    if (home.toLowerCase() === away.toLowerCase()) {
      errors.push(`Row ${i + 1}: home_team and away_team must differ`)
      continue
    }

    const kickoffIso = parseKickoff(input.kickoff)
    if (!kickoffIso) {
      errors.push(`Row ${i + 1}: invalid kickoff "${input.kickoff}"`)
      continue
    }

    const venue = input.venue?.trim() ?? ''
    rows.push({
      competition_id: competitionId,
      home_team: home,
      away_team: away,
      kickoff_time: kickoffIso,
      status: normalizeStatus(input.status),
      admin_notes: venue ? `Venue: ${venue}` : null,
      verification_status: 'verified',
    })
  }

  return { rows, errors }
}

/** Insert competition fixtures (idempotent on home/away/kickoff pair per competition). */
export async function importCompetitionFixtures(
  client: SupabaseClient,
  inputs: CompetitionFixtureInput[]
): Promise<ImportCompetitionFixturesResult> {
  const { rows, errors: buildErrors } = await buildCompetitionFixtureRows(client, inputs)
  if (buildErrors.length > 0 && rows.length === 0) {
    return { inserted: 0, skipped: 0, errors: buildErrors }
  }

  let inserted = 0
  let skipped = 0
  const errors = [...buildErrors]

  for (const row of rows) {
    const { data: existing, error: findErr } = await client
      .from('game_matches')
      .select('id')
      .eq('competition_id', row.competition_id)
      .eq('home_team', row.home_team)
      .eq('away_team', row.away_team)
      .eq('kickoff_time', row.kickoff_time)
      .maybeSingle()

    if (findErr) {
      errors.push(`Lookup failed (${row.home_team} vs ${row.away_team}): ${findErr.message}`)
      continue
    }
    if (existing?.id) {
      skipped += 1
      continue
    }

    const { error: insErr } = await client.from('game_matches').insert(row)
    if (insErr) {
      errors.push(`Insert failed (${row.home_team} vs ${row.away_team}): ${insErr.message}`)
      continue
    }
    inserted += 1
  }

  return { inserted, skipped, errors }
}
