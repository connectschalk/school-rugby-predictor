/** @deprecated Import from `@/components/CompetitionTeamLogo` instead. */
export {
  default,
  CompetitionMatchTeams,
  type CompetitionTeamLogoProps,
} from '@/components/CompetitionTeamLogo'

/** @deprecated All competitions resolve logos; schools use school crests. */
export function competitionUsesTeamLogos(_competitionSlug: string): boolean {
  return true
}
