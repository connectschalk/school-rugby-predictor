import { getCravenWeekTeamLogoPath } from '@/lib/craven-week-team-logos'
import { getSchoolTeamLogoPath } from '@/lib/school-team-logos'
import { getWorldCupTeamLogoPath } from '@/lib/world-cup-team-logos'

export function getCompetitionTeamLogoPath(
  competitionSlug: string | null | undefined,
  teamName: string
): string | null {
  if (competitionSlug === 'soccer-world-cup') return getWorldCupTeamLogoPath(teamName)
  if (competitionSlug === 'craven-week') return getCravenWeekTeamLogoPath(teamName)
  return getSchoolTeamLogoPath(teamName)
}
