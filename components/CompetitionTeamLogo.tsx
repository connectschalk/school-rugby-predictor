'use client'

import Image from 'next/image'
import { useState } from 'react'
import {
  getCompetitionTeamLogo,
  type GetCompetitionTeamLogoInput,
} from '@/lib/competition-team-logos'

export type { GetCompetitionTeamLogoInput, CompetitionTeamLogoResult } from '@/lib/competition-team-logos'
export type CompetitionTeamLogoProps = GetCompetitionTeamLogoInput & {
  size?: number
  className?: string
  /** Small circular badge (nav rows) vs larger crest tile (match headers). */
  variant?: 'badge' | 'crest'
  title?: string
}

function variantClasses(variant: 'badge' | 'crest'): { shell: string; image: string } {
  if (variant === 'crest') {
    return {
      shell: 'rounded-lg border border-gray-200 bg-white',
      image: 'object-contain p-1',
    }
  }
  return {
    shell: 'rounded-full bg-gray-100',
    image: 'object-cover',
  }
}

export default function CompetitionTeamLogo({
  competitionSlug,
  teamName,
  size = 28,
  className = '',
  variant = 'badge',
  title,
}: CompetitionTeamLogoProps) {
  const { src, initials } = getCompetitionTeamLogo({ competitionSlug, teamName })
  const [failed, setFailed] = useState(false)
  const styles = variantClasses(variant)
  const label = title ?? teamName

  if (!src || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center text-xs font-bold text-gray-600 ${styles.shell} ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
        title={label}
        aria-hidden
      >
        {initials}
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${styles.shell} ${styles.image} ${className}`}
      title={label}
      onError={() => setFailed(true)}
    />
  )
}

type MatchTeamsProps = {
  competitionSlug?: string | null
  homeTeam: string
  awayTeam: string
  size?: number
  layout?: 'inline' | 'versus'
  variant?: 'badge' | 'crest'
}

export function CompetitionMatchTeams({
  competitionSlug,
  homeTeam,
  awayTeam,
  size = 28,
  layout = 'inline',
  variant = 'badge',
}: MatchTeamsProps) {
  if (layout === 'versus') {
    return (
      <div className="flex items-center gap-2">
        <CompetitionTeamLogo
          competitionSlug={competitionSlug}
          teamName={homeTeam}
          size={size}
          variant={variant}
        />
        <span className="min-w-0 truncate font-semibold text-gray-900">{homeTeam}</span>
        <span className="text-xs font-bold text-gray-400">vs</span>
        <CompetitionTeamLogo
          competitionSlug={competitionSlug}
          teamName={awayTeam}
          size={size}
          variant={variant}
        />
        <span className="min-w-0 truncate font-semibold text-gray-900">{awayTeam}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <CompetitionTeamLogo
        competitionSlug={competitionSlug}
        teamName={homeTeam}
        size={size}
        variant={variant}
      />
      <span className="min-w-0 truncate">{homeTeam}</span>
      <span className="text-gray-400">vs</span>
      <CompetitionTeamLogo
        competitionSlug={competitionSlug}
        teamName={awayTeam}
        size={size}
        variant={variant}
      />
      <span className="min-w-0 truncate">{awayTeam}</span>
    </div>
  )
}
