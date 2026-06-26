import { describe, expect, it } from 'vitest'
import {
  clampPercent,
  clientPointToImagePercent,
  containerBoundsFromRect,
  imagePercentToStylePosition,
} from './map-placement'

describe('clampPercent', () => {
  it('clamps values to 0–100', () => {
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(42.5)).toBe(42.5)
  })
})

describe('clientPointToImagePercent', () => {
  const bounds = { left: 100, top: 50, width: 200, height: 100 }

  it('returns centre for click at centre', () => {
    expect(clientPointToImagePercent(200, 100, bounds)).toEqual({ x: 50, y: 50 })
  })

  it('returns top-left for click at origin of bounds', () => {
    expect(clientPointToImagePercent(100, 50, bounds)).toEqual({ x: 0, y: 0 })
  })

  it('clamps clicks outside bounds', () => {
    expect(clientPointToImagePercent(50, 0, bounds)).toEqual({ x: 0, y: 0 })
    expect(clientPointToImagePercent(400, 200, bounds)).toEqual({ x: 100, y: 100 })
  })

  it('handles zero-size bounds safely', () => {
    expect(clientPointToImagePercent(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 50,
      y: 50,
    })
  })
})

describe('imagePercentToStylePosition', () => {
  it('formats percentage CSS positions', () => {
    expect(imagePercentToStylePosition(25, 75)).toEqual({ left: '25%', top: '75%' })
  })
})

describe('containerBoundsFromRect', () => {
  it('maps DOMRect to image bounds', () => {
    const rect = { left: 10, top: 20, width: 300, height: 150 } as DOMRect
    expect(containerBoundsFromRect(rect)).toEqual({ left: 10, top: 20, width: 300, height: 150 })
  })
})
