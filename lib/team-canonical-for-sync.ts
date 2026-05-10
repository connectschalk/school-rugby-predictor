import type { SheetTeamCsvRow, SheetTeamsRegistry } from '@/lib/sheet-teams-registry'
import { buildTeamsSheetAliasResolverMap } from '@/lib/sync-teams-from-sheet'
import { buildTeamAliasResolverMap, type TeamAliasDbRow } from '@/lib/team-aliases-db'
import {
  matchTeamName,
  normalizeTeamKeyAsciiFold,
  type TeamRow,
} from '@/lib/team-name-match'

function mergeAliasResolverPreferSheet(sheet: Map<string, string>, db: Map<string, string>): Map<string, string> {
  const out = new Map(sheet)
  for (const [k, v] of db) {
    if (!out.has(k)) out.set(k, v)
  }
  return out
}

/**
 * Teams sheet aliases first; `public.team_aliases` fills keys missing from the sheet (ascii-fold aware).
 */
export function buildSheetSyncAliasMap(
  teamsSheetRows: SheetTeamCsvRow[],
  aliasRows: TeamAliasDbRow[],
  teams: TeamRow[]
): Map<string, string> {
  const sheet = buildTeamsSheetAliasResolverMap(teamsSheetRows)
  const fromDb = buildTeamAliasResolverMap(aliasRows, teams)
  return mergeAliasResolverPreferSheet(sheet, fromDb)
}

/**
 * Teams-tab resolution, then merged alias map, then exact `teams.name` / `teams.canonical_name`.
 * Use for `game_matches.home_team` / `away_team`, pair keys, and team–date duplicate checks.
 */
export function canonicalTeamLabelForGameMatches(
  rawOrResolved: string,
  registry: SheetTeamsRegistry,
  teams: TeamRow[],
  aliasMap: Map<string, string>
): string {
  const trimmed = rawOrResolved.trim()
  if (!trimmed) return trimmed
  const viaRegistry = registry.resolve(trimmed)
  const sheetCanon = viaRegistry.ok ? viaRegistry.team.canonicalName.trim() : trimmed

  const pick = (label: string): string | null => {
    const m = matchTeamName(label, teams, aliasMap)
    if (!m.matchedTeamName) return null
    if (m.matchMethod === 'exact' || m.matchMethod === 'normalized' || m.matchMethod === 'alias') {
      return m.matchedTeamName
    }
    if (m.matchMethod === 'fuzzy' && !m.needsReview) return m.matchedTeamName
    return null
  }

  return pick(sheetCanon) ?? pick(trimmed) ?? sheetCanon
}

/** Unordered pair key for sync duplicate detection (accent/punctuation-insensitive). */
export function orderedComparablePairKey(a: string, b: string): string {
  const x = normalizeTeamKeyAsciiFold(a)
  const y = normalizeTeamKeyAsciiFold(b)
  return [x, y].sort((p, q) => p.localeCompare(q)).join('|')
}
