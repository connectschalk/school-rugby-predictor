'use client'

import { useMemo, useState } from 'react'

function normalizeTeamName(teamName: string) {
  return teamName.trim().toLowerCase().replace(/\s+/g, '-')
}

export function getTeamLogo(teamName: string) {
  return `/team-logos/${normalizeTeamName(teamName)}.png`
}

export function RugbyBallIcon({ className = 'h-12 w-12 text-gray-700' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Rugby ball fallback"
      className={className}
    >
      <ellipse
        cx="32"
        cy="32"
        rx="21"
        ry="13"
        fill="currentColor"
        transform="rotate(-22 32 32)"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="14"
        ry="9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        transform="rotate(-22 32 32)"
      />
      <line
        x1="24"
        y1="26"
        x2="40"
        y2="38"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line x1="30" y1="30" x2="34" y2="34" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="27" y1="28" x2="31" y2="32" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="33" y1="32" x2="37" y2="36" stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  )
}

type TeamLogoCircleProps = {
  teamName: string
  /** Override logo URL (still uses rugby-ball fallback on error). */
  logoUrl?: string
  sizeClassName?: string
  imageSizeClassName?: string
}

/**
 * Plain &lt;img&gt; for reliable html-to-image / mobile PNG export.
 */
export function TeamLogoCircle({
  teamName,
  logoUrl,
  sizeClassName = 'h-32 w-32 md:h-36 md:w-36',
  imageSizeClassName = 'h-[82%] w-[82%]',
}: TeamLogoCircleProps) {
  const [failed, setFailed] = useState(false)
  const resolvedSrc = useMemo(() => logoUrl ?? getTeamLogo(teamName), [logoUrl, teamName])

  return (
    <div
      className={`flex items-center justify-center rounded-full border border-gray-200 bg-gray-50 ${sizeClassName}`}
    >
      {!failed && teamName ? (
        <img
          src={resolvedSrc}
          alt={`${teamName} logo`}
          className={`${imageSizeClassName} object-contain`}
          loading="eager"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="scale-110">
          <RugbyBallIcon />
        </div>
      )}
    </div>
  )
}
