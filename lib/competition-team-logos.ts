import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'
import { getCravenWeekTeamLogoPath } from '@/lib/craven-week-team-logos'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'
import { getWorldCupTeamLogoPath } from '@/lib/world-cup-team-logos'

export type GetCompetitionTeamLogoInput = {
  competitionSlug?: string | null
  teamName: string
}

export type CompetitionTeamLogoResult = {
  src: string | null
  initials: string
}

/** First letter fallback when no crest / flag is mapped. */
export function teamLogoInitials(teamName: string): string {
  const t = teamName.trim()
  return t ? t.charAt(0).toUpperCase() : '?'
}

/**
 * Resolve a static logo path for a team within a competition context.
 * Schools → `/team-logos/…`, Craven Week → provincial unions, World Cup → flags.
 */
export function getCompetitionTeamLogoPath(
  competitionSlug: string | null | undefined,
  teamName: string
): string | null {
  const slug = (competitionSlug ?? SCHOOLS_COMPETITION_SLUG).trim().toLowerCase()
  if (slug === 'soccer-world-cup') return getWorldCupTeamLogoPath(teamName)
  if (slug === 'craven-week') return getCravenWeekTeamLogoPath(teamName)
  return getSchoolTeamLogoPath(teamName)
}

/** Structured resolver for UI components and exports. */
export function getCompetitionTeamLogo({
  competitionSlug,
  teamName,
}: GetCompetitionTeamLogoInput): CompetitionTeamLogoResult {
  return {
    src: getCompetitionTeamLogoPath(competitionSlug, teamName),
    initials: teamLogoInitials(teamName),
  }
}
