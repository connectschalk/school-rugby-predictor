'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type Props = {
  /** Short name for assistive tech, e.g. "Points" */
  label: string
  /** Tooltip body */
  content: string
  /** Align panel toward end of cell (e.g. right-aligned table headers) */
  align?: 'start' | 'end'
}

/**
 * Small “i” control: hover (fine pointer) or keyboard focus shows tooltip; coarse pointer uses tap
 * to toggle; tap outside closes when open on touch.
 */
export default function InfoTooltip({ label, content, align = 'end' }: Props) {
  const tooltipId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const [placeAbove, setPlaceAbove] = useState(false)
  /** After Escape, ignore hover until pointer leaves the wrapper (fine pointer). */
  const hoverGateRef = useRef(true)

  const visible = coarsePointer ? pinned : hover || focused

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const sync = () => setCoarsePointer(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const estH = 140
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    setPlaceAbove(spaceBelow < estH && spaceAbove > spaceBelow)
  }, [visible])

  useEffect(() => {
    if (!pinned || !coarsePointer) return
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setPinned(false)
    }
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true)
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('pointerdown', onDoc, true)
    }
  }, [pinned, coarsePointer])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPinned(false)
      setHover(false)
      setFocused(false)
      hoverGateRef.current = false
      ;(wrapRef.current?.querySelector('button') as HTMLButtonElement | null)?.blur()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible])

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex shrink-0 items-center"
      onMouseEnter={() => {
        if (!coarsePointer && hoverGateRef.current) setHover(true)
      }}
      onMouseLeave={() => {
        if (!coarsePointer) setHover(false)
        hoverGateRef.current = true
      }}
    >
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[9px] font-bold leading-none text-gray-500 shadow-sm hover:border-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-800"
        aria-label={`More information: ${label}`}
        aria-expanded={visible}
        aria-controls={tooltipId}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(e) => {
          e.stopPropagation()
          if (coarsePointer) setPinned((p) => !p)
        }}
      >
        i
      </button>
      {visible ? (
        <div
          id={tooltipId}
          role="tooltip"
          aria-live="polite"
          className={`absolute z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 text-left text-xs font-normal normal-case leading-snug tracking-normal text-gray-800 shadow-lg ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${placeAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {content}
        </div>
      ) : null}
    </div>
  )
}
