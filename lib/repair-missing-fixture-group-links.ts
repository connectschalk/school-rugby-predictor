import type { SupabaseClient } from '@supabase/supabase-js'
import {
  linkMatchToFixtureGroup,
  loadFixtureGroupMaps,
  resolveGroupIdForRow,
  resolvePrestigePoolGroupId,
} from '@/lib/fixture-group-resolve'

const MAX_EXAMPLES = 25

type GameMatchRow = {
  id: string
  league_group: string | null
  province_group: string | null
  home_team: string
  away_team: string
  kickoff_time: string
  is_prestige: boolean | null
}

/**
 * For **every** completed `game_matches` row: clear `game_match_groups` for that match and insert the
 * correct row from `league_group` / `province_group` (league first, then province — same as master sheet sync).
 * Idempotent: safe to run after every sync or from the admin repair action.
 *
 * Rows with both group fields empty are **not** silently skipped: they are counted, listed in examples,
 * and summarized in `warnings`.
 */
export async function relinkAllCompletedMatchesToFixtureGroups(supabase: SupabaseClient): Promise<{
  processed: number
  linked: number
  skippedNoGroupFields: number
  unresolvedWithFields: number
  skippedNoGroupFieldsExamples: string[]
  unresolvedWithFieldsExamples: string[]
  warnings: string[]
}> {
  const maps = await loadFixtureGroupMaps(supabase)
  const warnings: string[] = []

  let processed = 0
  let linked = 0
  let skippedNoGroupFields = 0
  let unresolvedWithFields = 0
  const skippedNoGroupFieldsExamples: string[] = []
  const unresolvedWithFieldsExamples: string[] = []

  const pageSize = 500
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('game_matches')
      .select('id, league_group, province_group, home_team, away_team, kickoff_time, is_prestige')
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
      const label = `${m.home_team} vs ${m.away_team}`
      const isPrestige = !!m.is_prestige
      if (!league && !province && !isPrestige) {
        skippedNoGroupFields += 1
        if (skippedNoGroupFieldsExamples.length < MAX_EXAMPLES) {
          skippedNoGroupFieldsExamples.push(
            `${m.id} · ${label} · kickoff ${m.kickoff_time ?? '?'} (no league_group, province_group, or is_prestige)`
          )
        }
        continue
      }
      const resolved = resolveGroupIdForRow(
        league,
        province,
        maps.aliasToGroupId,
        maps.nameToGroupId,
        maps.slugToGroupId
      )
      const prestigeIds: string[] = []
      if (isPrestige) {
        const pid = resolvePrestigePoolGroupId(maps)
        if (pid) prestigeIds.push(pid)
        else {
          warnings.push(
            `Repair: is_prestige is true but Prestige Pool fixture group not found — ${m.id} · ${label}`
          )
        }
      }
      const gl = await linkMatchToFixtureGroup(supabase, m.id, resolved, label, warnings, prestigeIds)
      if (gl.linked_groups > 0) linked += 1
      else if (resolved.sourceValue && !resolved.groupId) {
        unresolvedWithFields += 1
        if (unresolvedWithFieldsExamples.length < MAX_EXAMPLES) {
          unresolvedWithFieldsExamples.push(
            `${m.id} · ${label} · kickoff ${m.kickoff_time ?? '?'} · league="${league}" province="${province}" (no matching fixture group / alias / slug)`
          )
        }
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  if (skippedNoGroupFields > 0) {
    warnings.push(
      `Group link repair summary: ${skippedNoGroupFields} completed match(es) skipped — no league_group, province_group, and is_prestige is false. Fix in Google master sheet or /admin/game-matches. Examples (first ${Math.min(MAX_EXAMPLES, skippedNoGroupFields)}): ${skippedNoGroupFieldsExamples.join(' | ')}`
    )
  }
  if (unresolvedWithFields > 0) {
    warnings.push(
      `Group link repair summary: ${unresolvedWithFields} completed match(es) have league/province text but no matching fixture_groups row (check aliases and names). Examples (first ${Math.min(MAX_EXAMPLES, unresolvedWithFields)}): ${unresolvedWithFieldsExamples.join(' | ')}`
    )
  }

  return {
    processed,
    linked,
    skippedNoGroupFields,
    unresolvedWithFields,
    skippedNoGroupFieldsExamples,
    unresolvedWithFieldsExamples,
    warnings,
  }
}
