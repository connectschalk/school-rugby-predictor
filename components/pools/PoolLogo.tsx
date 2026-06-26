'use client'

import { useState } from 'react'
import { DEFAULT_AVATAR_COLOUR, pickAvatarLetterTextColor } from '@/lib/letter-avatar'
import { POOL_LOGO_PIXELS, poolLogoInitials, type PoolLogoSize } from '@/lib/pool-logo'

export type PoolLogoProps = {
  logoUrl?: string | null
  name: string
  size?: PoolLogoSize
  className?: string
}

const XL_RESPONSIVE_CLASS = 'h-[72px] w-[72px] md:h-[120px] md:w-[120px]'

export default function PoolLogo({ logoUrl, name, size = 'md', className = '' }: PoolLogoProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const pixels = POOL_LOGO_PIXELS[size]
  const showImage = Boolean(logoUrl?.trim()) && !imageFailed
  const initials = poolLogoInitials(name)
  const letterColour = pickAvatarLetterTextColor(DEFAULT_AVATAR_COLOUR)
  const alt = `${name} logo`

  const sizeClass = size === 'xl' ? XL_RESPONSIVE_CLASS : ''
  const sizeStyle = size === 'xl' ? undefined : { width: pixels, height: pixels }
  const frameClass = `inline-flex shrink-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm ${sizeClass} ${className}`

  if (showImage) {
    return (
      <div className={frameClass} style={sizeStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl!}
          alt={alt}
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={`${frameClass} items-center justify-center bg-slate-100 font-black uppercase ${
        size === 'xl' ? 'text-2xl md:text-4xl' : 'text-xs'
      }`}
      style={
        size === 'xl'
          ? { color: letterColour, backgroundColor: DEFAULT_AVATAR_COLOUR }
          : {
              ...sizeStyle,
              color: letterColour,
              backgroundColor: DEFAULT_AVATAR_COLOUR,
              fontSize: Math.max(10, Math.round(pixels * 0.38)),
            }
      }
    >
      {initials}
    </span>
  )
}
