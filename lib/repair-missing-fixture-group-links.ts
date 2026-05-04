import type { SupabaseClient } from '@supabase/supabase-js'
import {
  collectGroupLinkResolutionWarnings,
  computeFixtureGroupLinkIds,
  loadFixtureGroupMaps,
  replaceMatchFixtureGroupLinks,
} from '@/lib/fixture-group-resolve'
import { ensureTournamentFixtureGroups } from '@/lib/tournament-fixture-groups'

const MAX_EXAMPLES = 25

type GameMatchRow = {
  id: string
  league_group: string | null
  province_group: string | null
  tournament: string | null
  home_team_province: string | null
  away_team_province: string | null
  is_interprovincial: boolean | null
  has_wp_elite_team: boolean | null
  is_prestige_match: boolean | null
  home_team: string
  away_team: string
  kickoff_time: string
  is_prestige: boolean | null
}

function crossProvinceFromDb(h: string | null, a: string | null): boolean {
  const x = (h ?? '').trim().toLowerCase()
  const y = (a ?? '').trim().toLowerCase()
  if (!x || !y) return false
  return x !== y
}

async function collectDistinctTournamentsFromCompleted(supabase: SupabaseClient): Promise<string[]> {
  const names = new Set<string>()
  let from = 0
  const pageSize = 500
  for (;;) {
    const { data, error } = await supabase
      .from('game_matches')
      .select('tournament')
      .eq('status', 'completed')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break

    for (const row of data as { tournament: string | null }[]) {
      const t = (row.tournament ?? '').trim()
      if (t) names.add(t)
    }

    if (data.length < pageSize) break
    from += pageSize
  }
  return [...names]
}

/**
 * For **every** completed `game_matches` row: clear `game_match_groups`, resolve links from
 * league → tournament → interprovincial (when flagged or inferred from team provinces) → prestige → WP Elite →
 * team provinces → optional legacy province_group, then insert resolved group links.
 */
export async function relinkAllCompletedMatchesToFixtureGroups(supabase: SupabaseClient): Promise<{
  processed: number
  linked: number
  skippedNoGroupFields: number
  interprovincialDefaultsApplied: number
  unresolvedWithFields: number
  skippedNoGroupFieldsExamples: string[]
  interprovincialDefaultsExamples: string[]
  unresolvedWithFieldsExamples: string[]
  warnings: string[]
}> {
  const tournamentNames = await collectDistinctTournamentsFromCompleted(supabase)
  const ens = await ensureTournamentFixtureGroups(supabase, tournamentNames)
  const warnings: string[] = []
  if (ens.error) {
    warnings.push(`Repair: ${ens.error}`)
  }

  let maps = await loadFixtureGroupMaps(supabase)

  let processed = 0
  let linked = 0
  let unresolvedWithFields = 0
  const unresolvedWithFieldsExamples: string[] = []

  const pageSize = 500
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('game_matches')
      .select(
        'id, league_group, province_group, tournament, home_team_province, away_team_province, is_interprovincial, has_wp_elite_team, is_prestige_match, home_team, away_team, kickoff_time, is_prestige'
      )
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break

    const rows = data as GameMatchRow[]
    for (const m of rows) {
      processed += 1
      const league = (m.league_group ?? '').trim()
      const legProv = (m.province_group ?? '').trim()
      const tournament = (m.tournament ?? '').trim()
      const hp = (m.home_team_province ?? '').trim()
      const ap = (m.away_team_province ?? '').trim()
      const label = `${m.home_team} vs ${m.away_team}`
      const isPrestige = !!m.is_prestige
      const interLink = !!(m.is_interprovincial ?? false) || crossProvinceFromDb(m.home_team_province, m.away_team_province)
      const wpLink = !!(m.has_wp_elite_team ?? false)

      const linkInput = {
        leagueForDb: league || null,
        legacyProvinceGroupForDb: legProv || null,
        tournamentForDb: tournament || null,
        homeTeamProvince: hp || null,
        awayTeamProvince: ap || null,
        linkPrestigePool: isPrestige,
        linkInterprovincialPool: interLink,
        linkWpElitePool: wpLink,
      }
      const warnEff = {
        leagueForDb: linkInput.leagueForDb,
        legacyProvinceGroupForDb: linkInput.legacyProvinceGroupForDb,
        tournamentForDb: linkInput.tournamentForDb,
        linkPrestigePool: linkInput.linkPrestigePool,
        linkInterprovincialPool: linkInput.linkInterprovincialPool,
        linkWpElitePool: linkInput.linkWpElitePool,
      }
      const sheet = {
        league,
        legacyProvince: legProv,
        tournament,
        homeTeamProvince: hp,
        awayTeamProvince: ap,
        isPrestigeMatchExplicit: m.is_prestige_match == null ? null : !!m.is_prestige_match,
      }
      const rowRes = collectGroupLinkResolutionWarnings(maps, warnEff, sheet, label)
      for (const w of rowRes.messages) warnings.push(w)

      const ids = computeFixtureGroupLinkIds(maps, linkInput)
      const gl = await replaceMatchFixtureGroupLinks(supabase, m.id, ids, label, warnings)
      if (gl.linked_groups > 0) linked += 1

      if (rowRes.hasHardIssue) {
        unresolvedWithFields += 1
        if (unresolvedWithFieldsExamples.length < MAX_EXAMPLES) {
          unresolvedWithFieldsExamples.push(
            `${m.id} · ${label} · kickoff ${m.kickoff_time ?? '?'} · league="${league}" legacy_prov="${legProv}" tournament="${tournament}" home_prov="${hp}" away_prov="${ap}"`
          )
        }
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return {
    processed,
    linked,
    skippedNoGroupFields: 0,
    interprovincialDefaultsApplied: 0,
    unresolvedWithFields,
    skippedNoGroupFieldsExamples: [],
    interprovincialDefaultsExamples: [],
    unresolvedWithFieldsExamples,
    warnings,
  }
}
