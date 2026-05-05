import type { FixtureGroupRow, PoolGroupsPreview } from './pools'
import { slugifyGroupName } from './fixture-group-resolve'
import { normalizeProvinceCode, provinceCodesForFixtureGroupSlug } from './teams-sheet-province'

/** Minimal match row for pool preview (client-side). */
export type PoolPreviewMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  status: string
  home_team_province?: string | null
  away_team_province?: string | null
  province_group?: string | null
}

const PREVIEW_TEAM_ALIAS: Record<string, string> = {
  'paarl boys': 'paarl boys high',
  'paarl boys high': 'paarl boys high',
  'paarl gim': 'paarl gimnasium',
  'paarl gimnasium': 'paarl gimnasium',
  affies: 'afrikaans hoer seuns',
  'afrikaans hoer seuns': 'afrikaans hoer seuns',
}

export function normalizePreviewTeamName(name: string): string {
  const n = name.trim().toLowerCase()
  return PREVIEW_TEAM_ALIAS[n] ?? n
}

function isProvinceStyleGroup(fg: FixtureGroupRow): boolean {
  const slug = (fg.slug ?? '').trim().toLowerCase()
  if (slug === 'prestige-pool' || slug === 'interprovincial') return false
  const t = (fg.group_type ?? 'custom').trim().toLowerCase()
  if (t === 'league' || t === 'tournament' || t === 'prestige') return false
  return true
}

/**
 * Pool previews follow the same rule as Predict: normalize `game_matches` province labels to
 * Teams sheet codes (BUL, PUM, …) before comparing to the fixture group’s province codes.
 */
function fieldMatchesProvinceGroup(
  label: string | null | undefined,
  fg: FixtureGroupRow,
  aliasLower: Set<string>
): boolean {
  const v = (label ?? '').trim()
  if (!v) return false
  const slug = (fg.slug ?? '').trim().toLowerCase()
  const groupCodes = provinceCodesForFixtureGroupSlug(slug)
  const codeSet = new Set(groupCodes)

  const fieldCode = normalizeProvinceCode(v)
  if (fieldCode && codeSet.size > 0 && codeSet.has(fieldCode)) return true

  const low = v.toLowerCase()
  const fgName = (fg.name ?? '').trim().toLowerCase()
  if (low === fgName) return true
  if (slug && slugifyGroupName(v) === slug) return true
  if (aliasLower.has(low)) return true

  if (codeSet.size === 0 && fieldCode) {
    const nameCode = normalizeProvinceCode(fg.name ?? '')
    if (nameCode && fieldCode === nameCode) return true
  }

  return false
}

export function matchFollowsProvinceGroup(
  m: PoolPreviewMatch,
  fg: FixtureGroupRow,
  aliases: string[]
): boolean {
  if (!isProvinceStyleGroup(fg)) return false
  const aliasLower = new Set(
    aliases.map((a) => a.trim().toLowerCase()).filter(Boolean)
  )
  return (
    fieldMatchesProvinceGroup(m.home_team_province, fg, aliasLower) ||
    fieldMatchesProvinceGroup(m.away_team_province, fg, aliasLower) ||
    fieldMatchesProvinceGroup(m.province_group, fg, aliasLower)
  )
}

export type PoolPreviewGraph = {
  links: { match_id: string; group_id: string }[]
  aliasesByGroupId: Map<string, string[]>
  coreTeamsByGroupId: Map<string, Set<string>>
}

export type PoolCreationMatched = {
  rows: PoolPreviewMatch[]
  groupNamesByMatch: Map<string, Set<string>>
}

/**
 * All non-cancelled fixtures in pool-creation scope (same rules as the live preview total).
 */
export function getPoolCreationMatched(
  selectedGroupIds: string[],
  fixtureGroups: FixtureGroupRow[],
  matches: PoolPreviewMatch[],
  graph: PoolPreviewGraph,
  customTeamNames: string[]
): PoolCreationMatched {
  const ids = [...new Set(selectedGroupIds.filter(Boolean))]
  const custom = [...new Set(customTeamNames.map((x) => x.trim()).filter(Boolean))]

  if (ids.length === 0) {
    if (custom.length === 0) return { rows: [], groupNamesByMatch: new Map() }
    const allow = new Set(custom)
    const matched = matches.filter(
      (m) =>
        (m.status ?? '') !== 'cancelled' &&
        (allow.has(m.home_team.trim()) || allow.has(m.away_team.trim()))
    )
    return { rows: matched, groupNamesByMatch: new Map() }
  }

  const fgById = new Map(fixtureGroups.map((g) => [g.id, g]))
  const selectedSet = new Set(ids)

  const linksForSelected = graph.links.filter((l) => selectedSet.has(l.group_id))
  const coreTeamsByGroupId = graph.coreTeamsByGroupId
  const groupsWithCore = new Set(
    [...coreTeamsByGroupId.entries()].filter(([, s]) => s.size > 0).map(([gid]) => gid)
  )

  const matchIds = new Set<string>()
  const groupNamesByMatch = new Map<string, Set<string>>()

  function addGroupName(matchId: string, groupId: string) {
    const fg = fgById.get(groupId)
    const name = fg?.name?.trim()
    if (!name) return
    if (!groupNamesByMatch.has(matchId)) groupNamesByMatch.set(matchId, new Set())
    groupNamesByMatch.get(matchId)!.add(name)
  }

  const matchById = new Map(matches.map((m) => [m.id, m]))
  for (const row of linksForSelected) {
    const m = matchById.get(row.match_id)
    if (!m || (m.status ?? '') === 'cancelled') continue
    if (groupsWithCore.has(row.group_id)) {
      const core = coreTeamsByGroupId.get(row.group_id) ?? new Set<string>()
      const coreNorm = [...core].map((t) => normalizePreviewTeamName(t))
      const h = normalizePreviewTeamName(m.home_team)
      const a = normalizePreviewTeamName(m.away_team)
      if (!coreNorm.includes(h) && !coreNorm.includes(a)) continue
    }
    matchIds.add(m.id)
    addGroupName(m.id, row.group_id)
  }

  for (const gid of ids) {
    const fg = fgById.get(gid)
    if (!fg || !isProvinceStyleGroup(fg)) continue
    const aliases = graph.aliasesByGroupId.get(gid) ?? []
    for (const m of matches) {
      if ((m.status ?? '') === 'cancelled') continue
      if (!matchFollowsProvinceGroup(m, fg, aliases)) continue
      matchIds.add(m.id)
      addGroupName(m.id, gid)
    }
  }

  const matched = matches.filter((m) => matchIds.has(m.id) && (m.status ?? '') !== 'cancelled')

  if (custom.length > 0) {
    const allow = new Set(custom)
    const filtered = matched.filter((m) => allow.has(m.home_team.trim()) || allow.has(m.away_team.trim()))
    return { rows: filtered, groupNamesByMatch }
  }

  return { rows: matched, groupNamesByMatch }
}

/** Upcoming/locked fixtures in [windowStartMs, windowEndMs) kickoff time. */
export function countPoolCreationMatchesInKickoffWindow(
  selectedGroupIds: string[],
  fixtureGroups: FixtureGroupRow[],
  matches: PoolPreviewMatch[],
  graph: PoolPreviewGraph,
  customTeamNames: string[],
  windowStartMs: number,
  windowEndMs: number,
  nowMs: number
): number {
  const { rows } = getPoolCreationMatched(selectedGroupIds, fixtureGroups, matches, graph, customTeamNames)
  return rows.filter((m) => {
    if ((m.status ?? '') === 'cancelled') return false
    if (m.status !== 'upcoming' && m.status !== 'locked') return false
    const t = new Date(m.kickoff_time).getTime()
    if (!Number.isFinite(t) || t < nowMs) return false
    return t >= windowStartMs && t < windowEndMs
  }).length
}

/**
 * Mirrors pool preview semantics: linked `game_match_groups` rows plus province-following
 * matches for province-style fixture groups, with optional `fixture_group_teams` narrowing
 * when a group defines core teams.
 */
export function computePoolCreationPreview(
  selectedGroupIds: string[],
  fixtureGroups: FixtureGroupRow[],
  matches: PoolPreviewMatch[],
  graph: PoolPreviewGraph,
  customTeamNames: string[]
): PoolGroupsPreview {
  const ids = [...new Set(selectedGroupIds.filter(Boolean))]
  const custom = [...new Set(customTeamNames.map((x) => x.trim()).filter(Boolean))]
  const nowTs = Date.now()

  if (ids.length === 0) {
    if (custom.length === 0) return { total_matches: 0, teams: [], fixtures: [] }
    const { rows: matched, groupNamesByMatch } = getPoolCreationMatched(ids, fixtureGroups, matches, graph, custom)
    const teamSet = new Set<string>(custom)
    for (const m of matched) {
      if (m.home_team.trim()) teamSet.add(m.home_team.trim())
      if (m.away_team.trim()) teamSet.add(m.away_team.trim())
    }
    const upcoming = matched
      .filter((m) => {
        const t = new Date(m.kickoff_time).getTime()
        if (!Number.isFinite(t) || t < nowTs) return false
        return m.status === 'upcoming' || m.status === 'locked'
      })
      .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    const fixtures = upcoming.slice(0, 10).map((m) => ({
      match_id: m.id,
      home_team: m.home_team,
      away_team: m.away_team,
      kickoff_time: m.kickoff_time,
      group_names: [...(groupNamesByMatch.get(m.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
    }))
    return {
      total_matches: matched.length,
      teams: [...teamSet].sort((a, b) => a.localeCompare(b)),
      fixtures,
    }
  }

  const { rows: matched, groupNamesByMatch } = getPoolCreationMatched(
    selectedGroupIds,
    fixtureGroups,
    matches,
    graph,
    customTeamNames
  )

  const teamSet = new Set<string>()
  for (const t of customTeamNames.map((x) => x.trim()).filter(Boolean)) {
    teamSet.add(t)
  }
  for (const m of matched) {
    if (m.home_team.trim()) teamSet.add(m.home_team.trim())
    if (m.away_team.trim()) teamSet.add(m.away_team.trim())
  }

  const upcoming = matched
    .filter((m) => {
      const t = new Date(m.kickoff_time).getTime()
      if (!Number.isFinite(t) || t < nowTs) return false
      return m.status === 'upcoming' || m.status === 'locked'
    })
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())

  const fixtures = upcoming.slice(0, 10).map((m) => ({
    match_id: m.id,
    home_team: m.home_team,
    away_team: m.away_team,
    kickoff_time: m.kickoff_time,
    group_names: [...(groupNamesByMatch.get(m.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
  }))

  if (custom.length > 0) {
    const ct = new Set<string>()
    for (const t of customTeamNames.map((x) => x.trim()).filter(Boolean)) ct.add(t)
    for (const m of matched) {
      if (m.home_team.trim()) ct.add(m.home_team.trim())
      if (m.away_team.trim()) ct.add(m.away_team.trim())
    }
    const upcomingF = matched
      .filter((m) => {
        const t = new Date(m.kickoff_time).getTime()
        if (!Number.isFinite(t) || t < nowTs) return false
        return m.status === 'upcoming' || m.status === 'locked'
      })
      .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    return {
      total_matches: matched.length,
      teams: [...ct].sort((a, b) => a.localeCompare(b)),
      fixtures: upcomingF.slice(0, 10).map((m) => ({
        match_id: m.id,
        home_team: m.home_team,
        away_team: m.away_team,
        kickoff_time: m.kickoff_time,
        group_names: [...(groupNamesByMatch.get(m.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
      })),
    }
  }

  return {
    total_matches: matched.length,
    teams: [...teamSet].sort((a, b) => a.localeCompare(b)),
    fixtures,
  }
}

/** Prefer non-empty teams / higher counts when merging RPC + client previews. */
export function mergePoolPreviewSources(
  rpc: PoolGroupsPreview | null,
  client: PoolGroupsPreview | null
): PoolGroupsPreview | null {
  if (!rpc && !client) return null
  if (!rpc) return client
  if (!client) return rpc

  const total = Math.max(rpc.total_matches, client.total_matches)
  const teamSet = new Set<string>([...rpc.teams, ...client.teams])
  const fixtures = client.fixtures.length > 0 ? client.fixtures : rpc.fixtures
  for (const f of fixtures) {
    if (f.home_team.trim()) teamSet.add(f.home_team.trim())
    if (f.away_team.trim()) teamSet.add(f.away_team.trim())
  }
  return {
    total_matches: total,
    teams: [...teamSet].sort((a, b) => a.localeCompare(b)),
    fixtures,
  }
}
