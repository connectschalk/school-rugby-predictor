'use client'

import type { MemoryPin } from '@/lib/memory-map/types'

type Props = {
  pin: MemoryPin
  onClick: () => void
  style?: React.CSSProperties
  highlighted?: boolean
}

export default function MemoryPinMarker({ pin, onClick, style, highlighted = false }: Props) {
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
        className={`flex min-h-9 min-w-9 items-center justify-center rounded-full border-2 px-2 text-xs font-black shadow-lg ${
          highlighted ? 'border-amber-300 ring-2 ring-amber-400/80 ring-offset-2 ring-offset-transparent' : 'border-white/80'
        }`}
        style={{ backgroundColor: colour, color: '#050505' }}
      >
        {count > 1 ? count : '●'}
      </span>
    </button>
  )
}
