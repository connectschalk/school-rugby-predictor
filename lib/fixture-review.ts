import { normalizeTeamKey } from '@/lib/team-name-match'

export type FixtureVerificationStatus = 'draft' | 'needs_review' | 'verified' | 'rejected'

export type FixtureReviewRow = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
}

export type FixtureWarningType =
  | 'same_team_multiple_same_day'
  | 'exact_duplicate'
  | 'reversed_duplicate'
  | 'unknown_team'
  | 'same_team_both_sides'

export type FixtureWarning = {
  type: FixtureWarningType
  message: string
}

function kickoffDateKey(kickoffIso: string): string {
  const d = new Date(kickoffIso)
  if (Number.isNaN(d.getTime())) return kickoffIso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function pairKey(kickoffIso: string, home: string, away: string): string {
  const a = normalizeTeamKey(home)
  const b = normalizeTeamKey(away)
  const teams = [a, b].sort()
  return `${kickoffIso}|${teams[0]}|${teams[1]}`
}

function exactKey(kickoffIso: string, home: string, away: string): string {
  return `${kickoffIso}|${normalizeTeamKey(home)}|${normalizeTeamKey(away)}`
}

export function detectFixtureWarnings(
  fixtures: FixtureReviewRow[],
  isKnownTeam: (name: string) => boolean
): Map<string, FixtureWarning[]> {
  const teamDateCount = new Map<string, number>()
  const exactCount = new Map<string, number>()
  const pairCount = new Map<string, number>()
  const pairOrderSet = new Map<string, Set<string>>()

  for (const f of fixtures) {
    const dateKey = kickoffDateKey(f.kickoff_time)
    const homeNorm = normalizeTeamKey(f.home_team)
    const awayNorm = normalizeTeamKey(f.away_team)

    const teamDateHome = `${dateKey}|${homeNorm}`
    const teamDateAway = `${dateKey}|${awayNorm}`
    teamDateCount.set(teamDateHome, (teamDateCount.get(teamDateHome) ?? 0) + 1)
    teamDateCount.set(teamDateAway, (teamDateCount.get(teamDateAway) ?? 0) + 1)

    const eKey = exactKey(f.kickoff_time, f.home_team, f.away_team)
    exactCount.set(eKey, (exactCount.get(eKey) ?? 0) + 1)

    const pKey = pairKey(f.kickoff_time, f.home_team, f.away_team)
    pairCount.set(pKey, (pairCount.get(pKey) ?? 0) + 1)
    if (!pairOrderSet.has(pKey)) pairOrderSet.set(pKey, new Set<string>())
    pairOrderSet.get(pKey)?.add(`${homeNorm}|${awayNorm}`)
  }

  const warningsByFixtureId = new Map<string, FixtureWarning[]>()
  for (const f of fixtures) {
    const out: FixtureWarning[] = []
    const dateKey = kickoffDateKey(f.kickoff_time)
    const homeNorm = normalizeTeamKey(f.home_team)
    const awayNorm = normalizeTeamKey(f.away_team)
    const eKey = exactKey(f.kickoff_time, f.home_team, f.away_team)
    const pKey = pairKey(f.kickoff_time, f.home_team, f.away_team)

    if (homeNorm && awayNorm && homeNorm === awayNorm) {
      out.push({
        type: 'same_team_both_sides',
        message: 'Home and away are the same team.',
      })
    }

    if (!isKnownTeam(f.home_team) || !isKnownTeam(f.away_team)) {
      out.push({
        type: 'unknown_team',
        message: 'One or both teams do not match teams/aliases.',
      })
    }

    const homeDateCount = teamDateCount.get(`${dateKey}|${homeNorm}`) ?? 0
    const awayDateCount = teamDateCount.get(`${dateKey}|${awayNorm}`) ?? 0
    if (homeDateCount > 1 || awayDateCount > 1) {
      out.push({
        type: 'same_team_multiple_same_day',
        message: 'A team appears in multiple fixtures on the same date.',
      })
    }

    if ((exactCount.get(eKey) ?? 0) > 1) {
      out.push({
        type: 'exact_duplicate',
        message: 'Exact duplicate fixture exists.',
      })
    }

    const orders = pairOrderSet.get(pKey)
    if ((pairCount.get(pKey) ?? 0) > 1 && (orders?.size ?? 0) > 1) {
      out.push({
        type: 'reversed_duplicate',
        message: 'Reversed duplicate fixture exists.',
      })
    }

    warningsByFixtureId.set(f.id, out)
  }

  return warningsByFixtureId
}
