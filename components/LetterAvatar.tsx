'use client'

import {
  pickAvatarLetterTextColor,
  resolveAvatarColour,
  resolveAvatarLetter,
  shouldUseLegacyAvatarImage,
} from '@/lib/letter-avatar'

export type LetterAvatarProps = {
  letter?: string | null
  colour?: string | null
  /** Legacy uploaded/static image URL */
  avatarUrl?: string | null
  firstName?: string | null
  displayName?: string | null
  /** Accessible name (e.g. display name) */
  name: string
  size: number
  className?: string
}

export default function LetterAvatar({
  letter,
  colour,
  avatarUrl,
  firstName,
  displayName,
  name,
  size,
  className = '',
}: LetterAvatarProps) {
  const display = displayName?.trim() || name.trim() || 'Player'
  const L = resolveAvatarLetter(letter, firstName, display)
  const C = resolveAvatarColour(colour)
  const letterColour = pickAvatarLetterTextColor(C)
  const legacy = shouldUseLegacyAvatarImage(avatarUrl)

  if (legacy && avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        aria-label={`${name} avatar`}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={`${name} avatar, letter ${L}`}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold leading-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: C,
        color: letterColour,
        fontSize: Math.max(10, Math.round(size * 0.42)),
      }}
    >
      {L}
    </span>
  )
}
