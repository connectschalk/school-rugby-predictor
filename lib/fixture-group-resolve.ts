import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export type ResolvedFixtureGroup = { groupId: string | null; sourceValue: string | null }

export type FixtureGroupMaps = {
  aliasToGroupId: Map<string, string>
  nameToGroupId: Map<string, string>
  slugToGroupId: Map<string, string>
  idToSlug: Map<string, string>
  idToName: Map<string, string>
  idToGroupType: Map<string, string | null>
}

/** Legacy label stored on `game_matches.province_group` when explicitly set (optional). */
export const INTERPROVINCIAL_DEFAULT_LABEL = 'Interprovincial'

/**
 * Sheet / DB short codes that must never link to ad-hoc `fixture_groups` rows (slug wp, ep, …).
 * Each maps to the canonical province (or union) `fixture_groups.slug`.
 */
export const PROVINCE_CODE_TO_CANONICAL_SLUG: Record<string, string> = {
  wp: 'western-province',
  ep: 'eastern-cape',
  fs: 'free-state-griquas',
  nc: 'free-state-griquas',
  gp: 'noordvaal',
  kzn: 'kwazulu-natal',
  bl: 'boland',
  swd: 'south-western-districts',
  bul: 'noordvaal',
  leo: 'noordvaal',
  lim: 'noordvaal',
  pum: 'noordvaal',
}

const PROVINCE_CODE_KEYS = new Set(Object.keys(PROVINCE_CODE_TO_CANONICAL_SLUG))

/** Slug of any row that is only a short-code duplicate (see migration 037); never use as link target. */
const AD_HOC_PROVINCE_SHORT_SLUGS = new Set(Object.keys(PROVINCE_CODE_TO_CANONICAL_SLUG))

export function slugifyGroupName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function logFixtureGroupResolution(
  maps: FixtureGroupMaps,
  inputLabel: string,
  groupId: string | null,
  via: string
): void {
  if (process.env.FIXTURE_GROUP_LINK_RESOLUTION_LOG !== '1') return
  const slug = groupId ? maps.idToSlug.get(groupId) : undefined
  const name = groupId ? maps.idToName.get(groupId) : undefined
  console.info('[fixture-group-link]', {
    inputLabel,
    via,
    groupId,
    resolvedName: name,
    resolvedSlug: slug,
  })
}

/**
 * Remap `fixture_groups.id` when it points at an ad-hoc short-code province row (slug wp, fs, …)
 * to the canonical province row id. Prestige / interprovincial / WP Premium / tournaments unchanged.
 */
export function legalizeGroupLinkTargetId(maps: FixtureGroupMaps, groupId: string | null): string | null {
  if (!groupId) return null
  const slug = maps.idToSlug.get(groupId)?.toLowerCase()
  if (!slug || !AD_HOC_PROVINCE_SHORT_SLUGS.has(slug)) return groupId
  const canonSlug = PROVINCE_CODE_TO_CANONICAL_SLUG[slug]
  if (!canonSlug) return null
  const canonId = maps.slugToGroupId.get(canonSlug)
  return canonId ?? null
}

function dedupeLegalGroupIds(maps: FixtureGroupMaps, ordered: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ordered) {
    const id = legalizeGroupLinkTargetId(maps, raw.trim())
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export async function loadFixtureGroupMaps(supabase: SupabaseClient): Promise<FixtureGroupMaps> {
  const { data: fixtureGroupsData } = await supabase
    .from('fixture_groups')
    .select('id, name, slug, group_type')
  const { data: fixtureGroupAliasesData } = await supabase.from('fixture_group_aliases').select('alias, group_id')
  const aliasToGroupId = new Map<string, string>()
  const nameToGroupId = new Map<string, string>()
  const slugToGroupId = new Map<string, string>()
  const idToSlug = new Map<string, string>()
  const idToName = new Map<string, string>()
  const idToGroupType = new Map<string, string | null>()

  for (const row of (
    (fixtureGroupsData as { id: string; name: string; slug: string; group_type: string | null }[] | null) ?? []
  )) {
    const id = row.id
    const name = (row.name ?? '').trim()
    const slug = String(row.slug ?? '').trim().toLowerCase()
    if (!id || !name || !slug) continue
    idToSlug.set(id, slug)
    idToName.set(id, name)
    idToGroupType.set(id, row.group_type ?? null)
    nameToGroupId.set(name.toLowerCase(), id)
    slugToGroupId.set(slug, id)
  }

  for (const badSlug of AD_HOC_PROVINCE_SHORT_SLUGS) {
    slugToGroupId.delete(badSlug)
  }
  for (const code of PROVINCE_CODE_KEYS) {
    nameToGroupId.delete(code)
  }

  for (const row of ((fixtureGroupAliasesData as { alias: string; group_id: string }[] | null) ?? [])) {
    if (!row.alias || !row.group_id) continue
    const key = row.alias.trim().toLowerCase()
    const legal = legalizeGroupLinkTargetId(
      { aliasToGroupId, nameToGroupId, slugToGroupId, idToSlug, idToName, idToGroupType },
      row.group_id
    )
    if (legal) aliasToGroupId.set(key, legal)
  }

  return { aliasToGroupId, nameToGroupId, slugToGroupId, idToSlug, idToName, idToGroupType }
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
  /** When set, UUIDs are remapped off ad-hoc province short-code rows before insert. */
  fixtureGroupMaps?: FixtureGroupMaps
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
 * Resolve a single label: province short codes → alias or canonical slug row;
 * then aliases → fixture_groups.name → slug (direct or slugified).
 * Never returns ids for ad-hoc short-code `fixture_groups` rows (slug wp, ep, …).
 */
export function resolveGroupIdFromLabel(raw: string, maps: FixtureGroupMaps): ResolvedFixtureGroup {
  const t = raw.trim()
  if (!t) return { groupId: null, sourceValue: null }
  const key = t.toLowerCase()

  const finish = (id: string | null, via: string): ResolvedFixtureGroup => {
    const legal = legalizeGroupLinkTargetId(maps, id)
    logFixtureGroupResolution(maps, t, legal, via)
    return { groupId: legal, sourceValue: t }
  }

  if (PROVINCE_CODE_KEYS.has(key)) {
    const aliasHit = maps.aliasToGroupId.get(key)
    if (aliasHit) return finish(aliasHit, 'province_code_alias')
    const canonSlug = PROVINCE_CODE_TO_CANONICAL_SLUG[key]
    if (canonSlug) {
      const canonId = maps.slugToGroupId.get(canonSlug)
      if (canonId) return finish(canonId, 'province_code_canonical_slug')
    }
    logFixtureGroupResolution(maps, t, null, 'province_code_unresolved')
    return { groupId: null, sourceValue: t }
  }

  const aliasHit = maps.aliasToGroupId.get(key)
  if (aliasHit) return finish(aliasHit, 'alias')
  const nameHit = maps.nameToGroupId.get(key)
  if (nameHit) return finish(nameHit, 'name')
  const slugDirect = maps.slugToGroupId.get(key)
  if (slugDirect) return finish(slugDirect, 'slug_direct')
  const slugHit = maps.slugToGroupId.get(slugifyGroupName(t))
  if (slugHit) return finish(slugHit, 'slug_slugified')
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
  const maps: FixtureGroupMaps = {
    aliasToGroupId,
    nameToGroupId,
    slugToGroupId,
    idToSlug: new Map(),
    idToName: new Map(),
    idToGroupType: new Map(),
  }
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
  return dedupeLegalGroupIds(maps, ordered)
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

  const fgm = options?.fixtureGroupMaps
  let insertIds = validGroupIds
  if (fgm) {
    insertIds = dedupeLegalGroupIds(fgm, validGroupIds)
    if (process.env.FIXTURE_GROUP_LINK_RESOLUTION_LOG === '1' && insertIds.join() !== validGroupIds.join()) {
      console.info('[fixture-group-link] insert remap', {
        matchId,
        rowLabel,
        before: validGroupIds,
        after: insertIds,
      })
    }
  }

  if (insertIds.length === 0) {
    return { linked_groups, group_link_warnings }
  }

  const rows = insertIds.map((group_id) => ({ match_id: matchId, group_id }))
  const { error: insertErr } = await supabase.from('game_match_groups').insert(rows)

  if (insertErr) {
    const full = formatPostgrestError(insertErr)
    console.error('[replaceMatchFixtureGroupLinks] INSERT game_match_groups failed', {
      matchId,
      rowLabel,
      home_team: matchTeams?.home,
      away_team: matchTeams?.away,
      attemptedGroupIds: insertIds,
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
      `Warning: could not insert game_match_groups for match_id=${matchId}${teamPart} (${rowLabel}); attempted group_id=[${insertIds.join(', ')}]; DB error: ${full}`
    )
    if (registerGroupLinkDbFailure(budget)) {
      return { linked_groups, group_link_warnings, aborted: true }
    }
    return { linked_groups, group_link_warnings }
  }

  linked_groups = insertIds.length
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
