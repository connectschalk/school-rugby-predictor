'use client'

import type { MemoryPin } from '@/lib/memory-map/types'

type Props = {
  pin: MemoryPin
  onClick: () => void
  style?: React.CSSProperties
}

export default function MemoryPinMarker({ pin, onClick, style }: Props) {
  const colour = pin.colour ?? pin.category?.colour ?? '#FFD400'
  const count = pin.story_count ?? 0

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={style}
      aria-label={pin.title}
    >
      <span
        className="flex min-h-9 min-w-9 items-center justify-center rounded-full border-2 border-white/80 px-2 text-xs font-black shadow-lg"
        style={{ backgroundColor: colour, color: '#050505' }}
      >
        {count > 1 ? count : '●'}
      </span>
    </button>
  )
}
