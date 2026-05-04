'use client'

import { useState } from 'react'
import {
  getProvinceLogoPath,
  provinceDisplayInitials,
  resolveProvinceLogoCodeFromFixtureGroup,
  resolveProvinceLogoCodeFromLabel,
  type ProvinceLogoCode,
} from '@/lib/province-logos'

type Props = {
  /** Section title or fixture group name */
  label: string
  /** Optional `fixture_groups.slug` for stable matching */
  slug?: string | null
  /** When true, only match using label rules (Predict page headings). */
  labelOnly?: boolean
  size?: number
  className?: string
}

export default function ProvinceLogoMark({
  label,
  slug,
  labelOnly = false,
  size = 30,
  className = '',
}: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const code: ProvinceLogoCode | null = labelOnly
    ? resolveProvinceLogoCodeFromLabel(label)
    : resolveProvinceLogoCodeFromFixtureGroup(label, slug)
  const path = code ? getProvinceLogoPath(code) : null
  const initials = provinceDisplayInitials(label)

  const boxStyle = { width: size, height: size }

  if (!path || imgFailed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 ${className}`}
        style={boxStyle}
        aria-hidden
      >
        {initials}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static public assets
    <img
      src={path}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full object-contain ring-1 ring-slate-200/90 ${className}`}
      style={boxStyle}
      onError={() => setImgFailed(true)}
    />
  )
}
