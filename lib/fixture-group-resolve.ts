import type { SupabaseClient } from '@supabase/supabase-js'

export type ResolvedFixtureGroup = { groupId: string | null; sourceValue: string | null }

export type FixtureGroupMaps = {
  aliasToGroupId: Map<string, string>
  nameToGroupId: Map<string, string>
  slugToGroupId: Map<string, string>
}

/** Legacy label stored on `game_matches.province_group` when explicitly set (optional). */
export const INTERPROVINCIAL_DEFAULT_LABEL = 'Interprovincial'

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

function formatMatchContext(matchId: string, rowLabel: string): string {
  return rowLabel.trim() ? `${matchId} (${rowLabel})` : matchId
}

/** Canonical Prestige Pool fixture group id from loaded maps (name, alias, or slug). */
export function resolvePrestigePoolGroupId(maps: FixtureGroupMaps): string | null {
  return (
    maps.nameToGroupId.get('prestige pool') ??
    maps.aliasToGroupId.get('prestige pool') ??
    maps.slugToGroupId.get('prestige-pool') ??
    null
  )
}

export function resolveInterprovincialGroupId(maps: FixtureGroupMaps): string | null {
  return (
    maps.nameToGroupId.get(INTERPROVINCIAL_DEFAULT_LABEL.toLowerCase()) ??
    maps.slugToGroupId.get('interprovincial') ??
    maps.aliasToGroupId.get(INTERPROVINCIAL_DEFAULT_LABEL.toLowerCase()) ??
    maps.aliasToGroupId.get('cross province') ??
    maps.aliasToGroupId.get('cross-province') ??
    null
  )
}

export function resolveWpElitePoolGroupId(maps: FixtureGroupMaps): string | null {
  return (
    maps.nameToGroupId.get('wp elite') ??
    maps.slugToGroupId.get('wp-elite') ??
    maps.aliasToGroupId.get('wp elite') ??
    null
  )
}

/** WP Premium pool (sheet / product); falls back to legacy WP Elite group if Premium slug missing. */
export function resolveWpPremiumPoolGroupId(maps: FixtureGroupMaps): string | null {
  return (
    maps.slugToGroupId.get('wp-premium') ??
    maps.nameToGroupId.get('wp premium') ??
    maps.aliasToGroupId.get('wp premium') ??
    resolveWpElitePoolGroupId(maps)
  )
}

/**
 * Resolve a single label against aliases → fixture_groups.name → slug (direct or slugified).
 */
export function resolveGroupIdFromLabel(raw: string, maps: FixtureGroupMaps): ResolvedFixtureGroup {
  const t = raw.trim()
  if (!t) return { groupId: null, sourceValue: null }
  const key = t.toLowerCase()
  const aliasHit = maps.aliasToGroupId.get(key)
  if (aliasHit) return { groupId: aliasHit, sourceValue: t }
  const nameHit = maps.nameToGroupId.get(key)
  if (nameHit) return { groupId: nameHit, sourceValue: t }
  const slugDirect = maps.slugToGroupId.get(key)
  if (slugDirect) return { groupId: slugDirect, sourceValue: t }
  const slugHit = maps.slugToGroupId.get(slugifyGroupName(t))
  if (slugHit) return { groupId: slugHit, sourceValue: t }
  return { groupId: null, sourceValue: t }
}

/**
 * Legacy: first resolvable label from league_group then province_group (single group).
 * Prefer `computeFixtureGroupLinkIds` for full competition context.
 */
export function resolveGroupIdForRow(
  leagueGroup: string,
  provinceGroup: string,
  aliasToGroupId: Map<string, string>,
  nameToGroupId: Map<string, string>,
  slugToGroupId: Map<string, string>
): ResolvedFixtureGroup {
  const maps: FixtureGroupMaps = { aliasToGroupId, nameToGroupId, slugToGroupId }
  for (const raw of [leagueGroup.trim(), provinceGroup.trim()].filter(Boolean)) {
    const r = resolveGroupIdFromLabel(raw, maps)
    if (r.groupId) return { groupId: r.groupId, sourceValue: raw }
  }
  const candidates = [leagueGroup.trim(), provinceGroup.trim()].filter(Boolean)
  return { groupId: null, sourceValue: candidates[0] ?? null }
}

/** @deprecated No longer drives Interprovincial default — kept for call-site compatibility (4th arg ignored). */
export function effectiveGroupFieldsForMatchRow(
  sheetLeague: string,
  sheetLegacyProvince: string,
  sheetTournament: string,
  _legacyUnused: boolean
): { leagueForDb: string | null; legacyProvinceGroupForDb: string | null; tournamentForDb: string | null } {
  void _legacyUnused
  return {
    leagueForDb: sheetLeague.trim() || null,
    legacyProvinceGroupForDb: sheetLegacyProvince.trim() || null,
    tournamentForDb: sheetTournament.trim() || null,
  }
}

export type FixtureGroupLinkInput = {
  leagueForDb: string | null
  /** Optional legacy `province_group` text — linked last if resolvable. */
  legacyProvinceGroupForDb: string | null
  tournamentForDb: string | null
  homeTeamProvince: string | null
  awayTeamProvince: string | null
  linkPrestigePool: boolean
  linkInterprovincialPool: boolean
  linkWpElitePool: boolean
}

/**
 * Ordered group ids: league → tournament → Interprovincial (when cross-province) → Prestige Pool → WP Premium (elite teams) →
 * team provinces (home, away) → optional legacy province_group.
 */
export function computeFixtureGroupLinkIds(maps: FixtureGroupMaps, input: FixtureGroupLinkInput): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  }

  const L = (input.leagueForDb ?? '').trim()
  const T = (input.tournamentForDb ?? '').trim()
  const legacyP = (input.legacyProvinceGroupForDb ?? '').trim()

  if (L) {
    const r = resolveGroupIdFromLabel(L, maps)
    if (r.groupId) push(r.groupId)
  }
  if (T) {
    const r = resolveGroupIdFromLabel(T, maps)
    if (r.groupId) push(r.groupId)
  }
  if (input.linkInterprovincialPool) {
    const iid = resolveInterprovincialGroupId(maps)
    if (iid) push(iid)
  }
  if (input.linkPrestigePool) {
    const pid = resolvePrestigePoolGroupId(maps)
    if (pid) push(pid)
  }
  if (input.linkWpElitePool) {
    const wid = resolveWpPremiumPoolGroupId(maps)
    if (wid) push(wid)
  }
  for (const raw of [(input.homeTeamProvince ?? '').trim(), (input.awayTeamProvince ?? '').trim()].filter(Boolean)) {
    const r = resolveGroupIdFromLabel(raw, maps)
    if (r.groupId) push(r.groupId)
  }
  if (legacyP) {
    const r = resolveGroupIdFromLabel(legacyP, maps)
    if (r.groupId) push(r.groupId)
  }
  return ordered
}

export type GroupLinkWarningEffective = {
  leagueForDb: string | null
  legacyProvinceGroupForDb: string | null
  tournamentForDb: string | null
  linkPrestigePool: boolean
  linkInterprovincialPool: boolean
  linkWpElitePool: boolean
}

export type SheetClassificationForWarnings = {
  league: string
  legacyProvince: string
  tournament: string
  homeTeamProvince: string
  awayTeamProvince: string
  /** null = fixtures sheet has no explicit is_prestige_match cell for this row. */
  isPrestigeMatchExplicit: boolean | null
}

export type CollectGroupLinkWarningsResult = {
  messages: string[]
  hasHardIssue: boolean
}

function isTotallyUnclassified(effective: GroupLinkWarningEffective, sheet: SheetClassificationForWarnings): boolean {
  return (
    !(effective.leagueForDb ?? '').trim() &&
    !(effective.legacyProvinceGroupForDb ?? '').trim() &&
    !(effective.tournamentForDb ?? '').trim() &&
    !effective.linkPrestigePool &&
    !effective.linkInterprovincialPool &&
    !effective.linkWpElitePool &&
    !(sheet.homeTeamProvince ?? '').trim() &&
    !(sheet.awayTeamProvince ?? '').trim()
  )
}

/**
 * Admin warnings for group resolution (league / tournament / legacy province / team provinces / flags).
 */
export function collectGroupLinkResolutionWarnings(
  maps: FixtureGroupMaps,
  effective: GroupLinkWarningEffective,
  sheet: SheetClassificationForWarnings,
  rowLabel: string
): CollectGroupLinkWarningsResult {
  const messages: string[] = []

  if (isTotallyUnclassified(effective, sheet)) {
    messages.push(
      `Notice: no league, tournament, legacy province_group, prestige, interprovincial, WP Premium, or team provinces (${rowLabel}) — no fixture group links will be created from classification.`
    )
    return { messages, hasHardIssue: false }
  }

  const L = (effective.leagueForDb ?? '').trim()
  const legacyP = (effective.legacyProvinceGroupForDb ?? '').trim()
  const T = (effective.tournamentForDb ?? '').trim()

  if (L) {
    const r = resolveGroupIdFromLabel(L, maps)
    if (!r.groupId) messages.push(`Warning: league_group "${L}" did not resolve (${rowLabel})`)
  }
  if (legacyP) {
    const r = resolveGroupIdFromLabel(legacyP, maps)
    if (!r.groupId) messages.push(`Warning: legacy province_group "${legacyP}" did not resolve (${rowLabel})`)
  }
  if (T) {
    const r = resolveGroupIdFromLabel(T, maps)
    if (!r.groupId) messages.push(`Warning: tournament "${T}" did not resolve (${rowLabel})`)
  }

  const HT = (sheet.homeTeamProvince ?? '').trim()
  if (HT) {
    const r = resolveGroupIdFromLabel(HT, maps)
    if (!r.groupId) messages.push(`Warning: home_team_province "${HT}" did not resolve (${rowLabel})`)
  }
  const AT = (sheet.awayTeamProvince ?? '').trim()
  if (AT) {
    const r = resolveGroupIdFromLabel(AT, maps)
    if (!r.groupId) messages.push(`Warning: away_team_province "${AT}" did not resolve (${rowLabel})`)
  }

  if (effective.linkInterprovincialPool && !resolveInterprovincialGroupId(maps)) {
    messages.push(`Warning: cross-province fixture but Interprovincial fixture group was not found (${rowLabel})`)
  }
  if (effective.linkPrestigePool && !resolvePrestigePoolGroupId(maps)) {
    messages.push(`Warning: prestige match but Prestige Pool fixture group was not found (${rowLabel})`)
  }
  if (effective.linkWpElitePool && !resolveWpPremiumPoolGroupId(maps)) {
    messages.push(`Warning: WP elite team involved but WP Premium / WP Elite fixture group was not found (${rowLabel})`)
  }

  return { messages, hasHardIssue: messages.length > 0 }
}

/**
 * Clears existing `game_match_groups` for the match, then inserts each id in order (deduped).
 */
export async function replaceMatchFixtureGroupLinks(
  supabase: SupabaseClient,
  matchId: string,
  orderedGroupIds: string[],
  rowLabel: string,
  errors: string[]
): Promise<{ linked_groups: number; group_link_warnings: number }> {
  let linked_groups = 0
  let group_link_warnings = 0
  const { error: clearLinksErr } = await supabase.from('game_match_groups').delete().eq('match_id', matchId)
  if (clearLinksErr) {
    group_link_warnings += 1
    errors.push(
      `Warning: could not clear old group links for match ${formatMatchContext(matchId, rowLabel)}: ${clearLinksErr.message}`
    )
    return { linked_groups, group_link_warnings }
  }
  const linkedIds = new Set<string>()
  for (const gid of orderedGroupIds) {
    const id = gid?.trim()
    if (!id || linkedIds.has(id)) continue
    const { error: linkErr } = await supabase
      .from('game_match_groups')
      .upsert({ match_id: matchId, group_id: id }, { onConflict: 'match_id,group_id', ignoreDuplicates: true })
    if (linkErr) {
      group_link_warnings += 1
      errors.push(
        `Warning: could not link fixture group for match ${formatMatchContext(matchId, rowLabel)}: ${linkErr.message}`
      )
    } else {
      linked_groups += 1
      linkedIds.add(id)
    }
  }
  if (orderedGroupIds.filter(Boolean).length === 0) {
    /* no-op: match intentionally has no group links */
  }
  return { linked_groups, group_link_warnings }
}

/**
 * Clears links and upserts all given fixture group ids (deduped, order preserved).
 */
export async function linkMatchToFixtureGroup(
  supabase: SupabaseClient,
  matchId: string,
  orderedGroupIds: string[],
  rowLabel: string,
  errors: string[]
): Promise<{ linked_groups: number; group_link_warnings: number }> {
  const deduped: string[] = []
  const seen = new Set<string>()
  for (const gid of orderedGroupIds) {
    const id = gid?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    deduped.push(id)
  }
  return replaceMatchFixtureGroupLinks(supabase, matchId, deduped, rowLabel, errors)
}
