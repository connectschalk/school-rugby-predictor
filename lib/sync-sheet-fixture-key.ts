import { teamLookupNormalize } from '@/lib/sheet-teams-registry'

/** Unit separator — stable delimiter (unlikely in school names). */
export const STABLE_SHEET_FIXTURE_KEY_SEP = '\u001f'

/**
 * Stable sheet fixture identity: calendar date + canonical home + canonical away (home/away order preserved).
 * Stored on `game_matches.fixture_key` for sheet-driven sync.
 */
export function buildStableSheetFixtureKey(matchDateYmd: string, homeCanon: string, awayCanon: string): string {
  const d = matchDateYmd.trim()
  const h = homeCanon.trim()
  const a = awayCanon.trim()
  return `${d}${STABLE_SHEET_FIXTURE_KEY_SEP}${h}${STABLE_SHEET_FIXTURE_KEY_SEP}${a}`
}

export function normalizeStableFixtureKeyForLookup(key: string): string {
  return teamLookupNormalize(key)
}
