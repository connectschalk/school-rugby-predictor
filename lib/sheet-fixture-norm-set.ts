import type { FixtureCsvRow } from '@/lib/parse-fixtures-sheet-csv'
import { normalizeDate, normalizeTime } from '@/lib/parse-fixtures-sheet-csv'
import { SheetTeamsRegistry, teamLookupNormalize } from '@/lib/sheet-teams-registry'
import { buildStableSheetFixtureKey, normalizeStableFixtureKeyForLookup } from '@/lib/sync-sheet-fixture-key'
import { canonicalTeamLabelForGameMatches } from '@/lib/team-canonical-for-sync'
import type { TeamRow } from '@/lib/team-name-match'

/**
 * Normalized stable fixture keys currently present on the Fixtures sheet (first occurrence per key wins).
 * Matches the identity used by sync-master-sheet after Teams resolution.
 */
export function computeSheetFixtureNormKeys(
  parsedRows: FixtureCsvRow[],
  teamRegistry: SheetTeamsRegistry,
  teams: TeamRow[],
  sheetSyncAliasMap: Map<string, string>
): { keys: Set<string>; errors: string[] } {
  const keys = new Set<string>()
  const errors: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < parsedRows.length; i += 1) {
    const r = parsedRows[i]
    const date = normalizeDate(r.date)
    const timeNorm = normalizeTime(r.time)
    const rawHome = r.home_team.trim()
    const rawAway = r.away_team.trim()
    if (!date) {
      errors.push(`Row ${i + 2}: missing or invalid date`)
      continue
    }
    if (!timeNorm) {
      errors.push(`Row ${i + 2}: missing or invalid time`)
      continue
    }
    if (!rawHome || !rawAway) {
      errors.push(`Row ${i + 2}: missing home_team or away_team`)
      continue
    }
    const hr = teamRegistry.resolve(rawHome)
    const ar = teamRegistry.resolve(rawAway)
    if (!hr.ok) {
      const nk = teamLookupNormalize(rawHome)
      const similar = teamRegistry.findSimilarLookupKeys(rawHome, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched home_team raw=${JSON.stringify(rawHome)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }
    if (!ar.ok) {
      const nk = teamLookupNormalize(rawAway)
      const similar = teamRegistry.findSimilarLookupKeys(rawAway, 10)
      const similarStr = similar.length ? similar.join(', ') : 'none'
      errors.push(
        `Row ${i + 2}: unmatched away_team raw=${JSON.stringify(rawAway)} normalized_key=${JSON.stringify(
          nk
        )} similar_lookup_keys=[${similarStr}] (Teams tab: team_name, canonical_name, comma-separated aliases; keys are trim+lowercase)`
      )
    }
    if (!hr.ok || !ar.ok) continue

    const homeDb = canonicalTeamLabelForGameMatches(rawHome, teamRegistry, teams, sheetSyncAliasMap)
    const awayDb = canonicalTeamLabelForGameMatches(rawAway, teamRegistry, teams, sheetSyncAliasMap)
    if (homeDb.toLowerCase() === awayDb.toLowerCase()) {
      errors.push(`Row ${i + 2}: home and away resolve to the same canonical team`)
      continue
    }

    const sheetFixtureKey = buildStableSheetFixtureKey(date, homeDb, awayDb)
    const dedupe = normalizeStableFixtureKeyForLookup(sheetFixtureKey)
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    keys.add(dedupe)
  }

  return { keys, errors }
}
