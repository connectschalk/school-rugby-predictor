export const SOCCER_WORLD_CUP_SLUG = 'soccer-world-cup'

export type SoccerKnockoutFixtureContext = {
  fixtureRound?: string | null
  leagueGroup?: string | null
  competitionSlug?: string | null
}

/** Normalise round/stage labels for fuzzy matching. */
export function normalizeSoccerRoundLabel(round?: string | null): string {
  return (round ?? '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the label clearly refers to group-stage play. */
export function isSoccerGroupStageLabel(...labels: Array<string | null | undefined>): boolean {
  for (const raw of labels) {
    const value = normalizeSoccerRoundLabel(raw)
    if (!value) continue
    if (/^group\b/.test(value)) return true
    if (value.includes('group stage')) return true
    if (value.includes('group phase')) return true
  }
  return false
}

/**
 * Whether a round/stage label refers to a knockout round.
 * Accepts values such as "Round Of 32", "R16", "Quarterfinal", "Semi-final", "Final".
 */
export function isSoccerKnockoutRound(round?: string | null): boolean {
  const value = normalizeSoccerRoundLabel(round)
  if (!value) return false
  if (isSoccerGroupStageLabel(value)) return false

  return (
    value.includes('round of 32') ||
    value.includes('round 32') ||
    value === 'r32' ||
    value.includes('last 32') ||
    value.includes('round of 16') ||
    value.includes('round 16') ||
    value === 'r16' ||
    value.includes('last 16') ||
    value.includes('knockout') ||
    value.includes('quarter') ||
    value.includes('semi') ||
    value === 'final' ||
    value.endsWith(' final') ||
    value.startsWith('final ') ||
    value.includes(' play off') ||
    value.includes('playoff') ||
    value.includes('third place')
  )
}

function resolveKnockoutContext(
  input: SoccerKnockoutFixtureContext | string | null | undefined
): SoccerKnockoutFixtureContext {
  if (typeof input === 'string' || input == null) {
    return { fixtureRound: input ?? null }
  }
  return input
}

/**
 * Whether a soccer fixture can be decided by a penalty shootout after a draw.
 * Uses fixture_round, league_group, and a World Cup fallback when round data is missing.
 */
export function isKnockoutSoccerFixture(
  input: SoccerKnockoutFixtureContext | string | null | undefined
): boolean {
  const { fixtureRound, leagueGroup, competitionSlug } = resolveKnockoutContext(input)

  if (isSoccerGroupStageLabel(fixtureRound, leagueGroup)) {
    return false
  }

  if (isSoccerKnockoutRound(fixtureRound) || isSoccerKnockoutRound(leagueGroup)) {
    return true
  }

  const slug = (competitionSlug ?? '').trim().toLowerCase()
  if (slug === SOCCER_WORLD_CUP_SLUG) {
    // Imported World Cup knockout fixtures may omit round/stage; non-group fixtures are knockout.
    return true
  }

  return false
}

export function soccerKnockoutContextFromMatch(
  match: { fixture_round?: string | null; league_group?: string | null },
  competitionSlug?: string | null
): SoccerKnockoutFixtureContext {
  return {
    fixtureRound: match.fixture_round ?? null,
    leagueGroup: match.league_group ?? null,
    competitionSlug: competitionSlug ?? null,
  }
}
