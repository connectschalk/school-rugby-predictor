'use client'

type Props = {
  className?: string
}

export default function CommunityPicksIcon({ className = '' }: Props) {
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`} aria-hidden>
      <span className="h-3.5 w-3.5 rounded-full border-2 border-red-600" />
      <span className="absolute h-1.5 w-1.5 rounded-full border border-red-600" />
    </span>
  )
}
