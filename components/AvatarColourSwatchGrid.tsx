'use client'

import { AVATAR_COLOUR_OPTIONS, pickAvatarLetterTextColor } from '@/lib/letter-avatar'

type Props = {
  selectedHex: string
  onSelect: (hex: string) => void
}

function normHex(h: string) {
  return h.trim().toLowerCase()
}

export default function AvatarColourSwatchGrid({ selectedHex, onSelect }: Props) {
  const selected = normHex(selectedHex)

  return (
    <div
      className="grid grid-cols-6 gap-2 sm:grid-cols-8 sm:gap-2.5"
      role="group"
      aria-label="Avatar colour presets"
    >
      {AVATAR_COLOUR_OPTIONS.map((opt) => {
        const active = selected === normHex(opt.value)
        const lightSwatch = pickAvatarLetterTextColor(opt.value) === '#111318'
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onSelect(opt.value)}
            className={`relative h-9 w-9 rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 sm:h-10 sm:w-10 ${
              active
                ? 'border-gray-900 ring-2 ring-red-600 ring-offset-2 ring-offset-white'
                : lightSwatch
                  ? 'border-gray-300 shadow-sm hover:border-gray-400'
                  : 'border-gray-200 hover:border-gray-500'
            } `}
            style={{ backgroundColor: opt.value }}
            aria-label={opt.label}
            aria-pressed={active}
          />
        )
      })}
    </div>
  )
}
