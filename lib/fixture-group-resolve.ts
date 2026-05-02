import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedFixtureGroup = { groupId: string | null; sourceValue: string | null }

export type FixtureGroupMaps = {
  aliasToGroupId: Map<string, string>
  nameToGroupId: Map<string, string>
  slugToGroupId: Map<string, string>
}

export function slugifyGroupName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function loadFixtureGroupMaps(supabase: SupabaseClient): Promise<FixtureGroupMaps> {
  const { data: fixtureGroupsData } = await supabase.from('fixture_groups').select('id, name, slug')
  const { data: fixtureGroupAliasesData } = await supabase.from('fixture_group_aliases').select('alias, group_id')
  const aliasToGroupId = new Map<string, string>()
  const nameToGroupId = new Map<string, string>()
  const slugToGroupId = new Map<string, string>()
  for (const row of ((fixtureGroupsData as { id: string; name: string; slug: string }[] | null) ?? [])) {
    nameToGroupId.set((row.name ?? '').trim().toLowerCase(), row.id)
    if (row.slug) slugToGroupId.set(String(row.slug).trim().toLowerCase(), row.id)
  }
  for (const row of ((fixtureGroupAliasesData as { alias: string; group_id: string }[] | null) ?? [])) {
    if (!row.alias || !row.group_id) continue
    aliasToGroupId.set(row.alias.trim().toLowerCase(), row.group_id)
  }
  return { aliasToGroupId, nameToGroupId, slugToGroupId }
}

/**
 * Resolve a fixture group from `game_matches.league_group` and `province_group`.
 * Tries **league_group** first, then **province_group** (first match wins).
 * For each non-empty value, matches in order:
 * `fixture_group_aliases.alias` → `fixture_groups.name` → `fixture_groups.slug` (exact lowercased slug, then slugified text).
 */
export function resolveGroupIdForRow(
  leagueGroup: string,
  provinceGroup: string,
  aliasToGroupId: Map<string, string>,
  nameToGroupId: Map<string, string>,
  slugToGroupId: Map<string, string>
): ResolvedFixtureGroup {
  const candidates = [leagueGroup.trim(), provinceGroup.trim()].filter(Boolean)
  for (const raw of candidates) {
    const key = raw.toLowerCase()
    const aliasHit = aliasToGroupId.get(key)
    if (aliasHit) return { groupId: aliasHit, sourceValue: raw }
    const nameHit = nameToGroupId.get(key)
    if (nameHit) return { groupId: nameHit, sourceValue: raw }
    const slugDirect = slugToGroupId.get(key)
    if (slugDirect) return { groupId: slugDirect, sourceValue: raw }
    const slugHit = slugToGroupId.get(slugifyGroupName(raw))
    if (slugHit) return { groupId: slugHit, sourceValue: raw }
  }
  return { groupId: null, sourceValue: candidates[0] ?? null }
}

/**
 * Clears existing `game_match_groups` for the match and inserts one row when `resolvedGroup.groupId` is set.
 * Idempotent for the same inputs.
 */
export async function linkMatchToFixtureGroup(
  supabase: SupabaseClient,
  matchId: string,
  resolvedGroup: ResolvedFixtureGroup,
  rowLabel: string,
  errors: string[]
): Promise<{ linked_groups: number; group_link_warnings: number }> {
  let linked_groups = 0
  let group_link_warnings = 0
  const { error: clearLinksErr } = await supabase.from('game_match_groups').delete().eq('match_id', matchId)
  if (clearLinksErr) {
    group_link_warnings += 1
    errors.push(`Warning: could not clear old group links for match ${matchId}: ${clearLinksErr.message}`)
    return { linked_groups, group_link_warnings }
  }
  if (resolvedGroup.groupId) {
    const { error: linkErr } = await supabase
      .from('game_match_groups')
      .upsert(
        { match_id: matchId, group_id: resolvedGroup.groupId },
        { onConflict: 'match_id,group_id', ignoreDuplicates: true }
      )
    if (linkErr) {
      group_link_warnings += 1
      errors.push(`Warning: could not link fixture group for match ${matchId}: ${linkErr.message}`)
    } else {
      linked_groups += 1
    }
  } else if (resolvedGroup.sourceValue) {
    group_link_warnings += 1
    errors.push(`Warning: no fixture group found for "${resolvedGroup.sourceValue}" (${rowLabel})`)
  }
  return { linked_groups, group_link_warnings }
}
