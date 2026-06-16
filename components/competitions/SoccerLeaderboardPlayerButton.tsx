'use client'

import LetterAvatar from '@/components/LetterAvatar'

type Props = {
  name: string
  displayName: string | null
  avatarUrl: string | null
  avatarLetter: string | null
  avatarColour: string | null
  size?: number
  isYou?: boolean
  onOpen: () => void
  className?: string
}

export default function SoccerLeaderboardPlayerButton({
  name,
  displayName,
  avatarUrl,
  avatarLetter,
  avatarColour,
  size = 32,
  isYou = false,
  onOpen,
  className = '',
}: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-w-0 items-center gap-2 rounded-lg text-left transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800 ${className}`}
      aria-label={`View scoring breakdown for ${name}`}
    >
      <LetterAvatar
        letter={avatarLetter}
        colour={avatarColour}
        avatarUrl={avatarUrl}
        displayName={displayName}
        name={name}
        size={size}
        className="shrink-0 ring-1 ring-gray-200"
      />
      <span className="min-w-0 truncate font-medium text-gray-900">
        {name}
        {isYou ? <span className="ml-1.5 text-xs font-semibold text-red-700">You</span> : null}
      </span>
    </button>
  )
}
