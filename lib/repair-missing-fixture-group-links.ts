import type { SupabaseClient } from '@supabase/supabase-js'
import {
  linkMatchToFixtureGroup,
  loadFixtureGroupMaps,
  resolveGroupIdForRow,
} from '@/lib/fixture-group-resolve'

type GameMatchRow = {
  id: string
  league_group: string | null
  province_group: string | null
  home_team: string
  away_team: string
}

/**
 * For **every** completed `game_matches` row: clear `game_match_groups` for that match and insert the
 * correct row from `league_group` / `province_group` (league first, then province — same as master sheet sync).
 * Idempotent: safe to run after every sync or from the admin repair action.
 */
export async function relinkAllCompletedMatchesToFixtureGroups(supabase: SupabaseClient): Promise<{
  processed: number
  linked: number
  skippedNoGroupFields: number
  unresolvedWithFields: number
  warnings: string[]
}> {
  const maps = await loadFixtureGroupMaps(supabase)
  const warnings: string[] = []

  let processed = 0
  let linked = 0
  let skippedNoGroupFields = 0
  let unresolvedWithFields = 0

  const pageSize = 500
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('game_matches')
      .select('id, league_group, province_group, home_team, away_team')
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break

    const rows = data as GameMatchRow[]
    for (const m of rows) {
      processed += 1
      const league = (m.league_group ?? '').trim()
      const province = (m.province_group ?? '').trim()
      if (!league && !province) {
        skippedNoGroupFields += 1
        continue
      }
      const resolved = resolveGroupIdForRow(
        league,
        province,
        maps.aliasToGroupId,
        maps.nameToGroupId,
        maps.slugToGroupId
      )
      const label = `${m.home_team} vs ${m.away_team}`
      const gl = await linkMatchToFixtureGroup(supabase, m.id, resolved, label, warnings)
      if (gl.linked_groups > 0) linked += 1
      else if (resolved.sourceValue && !resolved.groupId) unresolvedWithFields += 1
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  return {
    processed,
    linked,
    skippedNoGroupFields,
    unresolvedWithFields,
    warnings,
  }
}
