/** Image-map pin placement: store x/y as 0–100 percentages. */

export type Point = { x: number; y: number }

export type ImageBounds = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Convert a client click/tap to percentage coordinates within image bounds.
 * Clamps to 0–100 with one decimal place.
 */
export function clientPointToImagePercent(
  clientX: number,
  clientY: number,
  bounds: ImageBounds
): Point {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 50, y: 50 }
  }
  const x = ((clientX - bounds.left) / bounds.width) * 100
  const y = ((clientY - bounds.top) / bounds.height) * 100
  return {
    x: clampPercent(Math.round(x * 10) / 10),
    y: clampPercent(Math.round(y * 10) / 10),
  }
}

/** CSS position for a pin at percentage coordinates (centred on point). */
export function imagePercentToStylePosition(x: number, y: number): { left: string; top: string } {
  return {
    left: `${clampPercent(x)}%`,
    top: `${clampPercent(y)}%`,
  }
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/**
 * For object-fit cover/contain style maps: use container bounds when image fills container.
 * MapCanvas uses full container — bounds = container rect.
 */
export function containerBoundsFromRect(rect: DOMRect): ImageBounds {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}
