import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

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

/** Full PostgREST / Postgres error for logs and admin validation messages. */
export function formatPostgrestError(err: PostgrestError): string {
  const parts = [err.message]
  if (err.code) parts.push(`code=${err.code}`)
  if (err.details) parts.push(`details=${err.details}`)
  if (err.hint) parts.push(`hint=${err.hint}`)
  return parts.join(' | ')
}

/** Standard string form UUID (any version) from DB / maps. */
const UUID_STRING_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GroupLinkBudget = {
  failures: number
  maxFailures: number
}

export type ReplaceMatchFixtureGroupLinksOptions = {
  budget?: GroupLinkBudget
  matchTeams?: { home: string; away: string }
}

function budgetExceeded(budget: GroupLinkBudget | undefined): boolean {
  return !!budget && budget.failures >= budget.maxFailures
}

function registerGroupLinkDbFailure(budget: GroupLinkBudget | undefined): boolean {
  if (!budget) return false
  budget.failures += 1
  return budget.failures >= budget.maxFailures
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
 * Clears existing `game_match_groups` for the match, then bulk-inserts
 * `{ match_id, group_id }` rows (schema: PK match_id + group_id, both UUIDs).
 * One round trip per match; surfaces full PostgREST errors and respects optional failure budget.
 */
export async function replaceMatchFixtureGroupLinks(
  supabase: SupabaseClient,
  matchId: string,
  orderedGroupIds: string[],
  rowLabel: string,
  errors: string[],
  options?: ReplaceMatchFixtureGroupLinksOptions
): Promise<{ linked_groups: number; group_link_warnings: number; aborted?: boolean }> {
  const budget = options?.budget
  const matchTeams = options?.matchTeams

  if (budgetExceeded(budget)) {
    return { linked_groups: 0, group_link_warnings: 0, aborted: true }
  }

  let linked_groups = 0
  let group_link_warnings = 0

  const { error: clearLinksErr } = await supabase.from('game_match_groups').delete().eq('match_id', matchId)
  if (clearLinksErr) {
    const full = formatPostgrestError(clearLinksErr)
    console.error('[replaceMatchFixtureGroupLinks] DELETE game_match_groups failed', {
      matchId,
      rowLabel,
      home_team: matchTeams?.home,
      away_team: matchTeams?.away,
      postgrest: {
        message: clearLinksErr.message,
        code: clearLinksErr.code,
        details: clearLinksErr.details,
        hint: clearLinksErr.hint,
      },
    })
    group_link_warnings += 1
    const teamPart =
      matchTeams && (matchTeams.home || matchTeams.away)
        ? ` home_team="${matchTeams.home}" away_team="${matchTeams.away}"`
        : ''
    errors.push(
      `Warning: could not clear game_match_groups for match_id=${matchId}${teamPart} (${rowLabel}); DB error: ${full}`
    )
    if (registerGroupLinkDbFailure(budget)) {
      return { linked_groups, group_link_warnings, aborted: true }
    }
    return { linked_groups, group_link_warnings }
  }

  const seen = new Set<string>()
  const validGroupIds: string[] = []
  const invalidIds: string[] = []
  for (const gid of orderedGroupIds) {
    const id = gid?.trim()
    if (!id || seen.has(id)) continue
    if (!UUID_STRING_RE.test(id)) {
      if (invalidIds.length < 12) invalidIds.push(id)
      continue
    }
    seen.add(id)
    validGroupIds.push(id)
  }

  if (invalidIds.length) {
    group_link_warnings += 1
    errors.push(
      `Warning: skipped non-UUID group_id value(s) for match_id=${matchId} (${rowLabel}): ${invalidIds.join(', ')}`
    )
  }

  if (validGroupIds.length === 0) {
    return { linked_groups, group_link_warnings }
  }

  const rows = validGroupIds.map((group_id) => ({ match_id: matchId, group_id }))
  const { error: insertErr } = await supabase.from('game_match_groups').insert(rows)

  if (insertErr) {
    const full = formatPostgrestError(insertErr)
    console.error('[replaceMatchFixtureGroupLinks] INSERT game_match_groups failed', {
      matchId,
      rowLabel,
      home_team: matchTeams?.home,
      away_team: matchTeams?.away,
      attemptedGroupIds: validGroupIds,
      postgrest: {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
      },
    })
    group_link_warnings += 1
    const teamPart =
      matchTeams && (matchTeams.home || matchTeams.away)
        ? ` home_team="${matchTeams.home}" away_team="${matchTeams.away}"`
        : ''
    errors.push(
      `Warning: could not insert game_match_groups for match_id=${matchId}${teamPart} (${rowLabel}); attempted group_id=[${validGroupIds.join(', ')}]; DB error: ${full}`
    )
    if (registerGroupLinkDbFailure(budget)) {
      return { linked_groups, group_link_warnings, aborted: true }
    }
    return { linked_groups, group_link_warnings }
  }

  linked_groups = validGroupIds.length
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
  errors: string[],
  options?: ReplaceMatchFixtureGroupLinksOptions
): Promise<{ linked_groups: number; group_link_warnings: number; aborted?: boolean }> {
  const deduped: string[] = []
  const seen = new Set<string>()
  for (const gid of orderedGroupIds) {
    const id = gid?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    deduped.push(id)
  }
  return replaceMatchFixtureGroupLinks(supabase, matchId, deduped, rowLabel, errors, options)
}
