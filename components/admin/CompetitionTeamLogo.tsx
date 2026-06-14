'use client'

import Image from 'next/image'
import { getCompetitionTeamLogoPath } from '@/lib/competition-team-logos'

type Props = {
  competitionSlug: string
  teamName: string
  size?: number
  className?: string
}

export function competitionUsesTeamLogos(competitionSlug: string): boolean {
  return competitionSlug === 'soccer-world-cup' || competitionSlug === 'craven-week'
}

export default function CompetitionTeamLogo({
  competitionSlug,
  teamName,
  size = 28,
  className = '',
}: Props) {
  const src = getCompetitionTeamLogoPath(competitionSlug, teamName)
  const initial = teamName.trim().slice(0, 1).toUpperCase() || '?'

  if (!src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 ${className}`}
        style={{ width: size, height: size }}
        title={teamName}
      >
        {initial}
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-cover ${className}`}
      title={teamName}
    />
  )
}

type MatchTeamsProps = {
  competitionSlug: string
  homeTeam: string
  awayTeam: string
  size?: number
  layout?: 'inline' | 'versus'
}

export function CompetitionMatchTeams({
  competitionSlug,
  homeTeam,
  awayTeam,
  size = 28,
  layout = 'inline',
}: MatchTeamsProps) {
  if (layout === 'versus') {
    return (
      <div className="flex items-center gap-2">
        <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={homeTeam} size={size} />
        <span className="min-w-0 truncate font-semibold text-gray-900">{homeTeam}</span>
        <span className="text-xs font-bold text-gray-400">vs</span>
        <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={awayTeam} size={size} />
        <span className="min-w-0 truncate font-semibold text-gray-900">{awayTeam}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={homeTeam} size={size} />
      <span className="min-w-0 truncate">{homeTeam}</span>
      <span className="text-gray-400">vs</span>
      <CompetitionTeamLogo competitionSlug={competitionSlug} teamName={awayTeam} size={size} />
      <span className="min-w-0 truncate">{awayTeam}</span>
    </div>
  )
}
