/** Max featured upcoming/locked fixtures (enforced in admin UI + insert validation). */
export const FEATURED_MATCHES_MAX = 10

export type LiveFeaturedRow = {
  id: string
  is_featured: boolean
  featured_order: number | null
}

/** In-import checks only (no DB); use before fetch for inline UI errors. */
export function validatePreviewFeaturedShape(
  insertable: { isFeatured: boolean; featuredOrder: number | null }[]
): string | null {
  const feat = insertable.filter((r) => r.isFeatured)
  if (feat.length > FEATURED_MATCHES_MAX) {
    return `At most ${FEATURED_MATCHES_MAX} featured games in this import.`
  }
  return null
}

/**
 * Validates featured flags for a bulk insert (new rows have no ids yet).
 * `upcomingLocked` = all upcoming/locked rows (featured or not) for counts and order conflicts.
 */
export function validatePreviewFeaturedRowsForInsert(
  insertable: { isFeatured: boolean; featuredOrder: number | null }[],
  upcomingLocked: LiveFeaturedRow[]
): string | null {
  const shape = validatePreviewFeaturedShape(insertable)
  if (shape) return shape

  const liveFeatured = upcomingLocked.filter((r) => !!r.is_featured)
  const feat = insertable.filter((r) => r.isFeatured)

  if (liveFeatured.length + feat.length > FEATURED_MATCHES_MAX) {
    const left = FEATURED_MATCHES_MAX - liveFeatured.length
    return `Only ${left} featured slot(s) remain for upcoming/locked fixtures (max ${FEATURED_MATCHES_MAX} total).`
  }
  return null
}

/** Validates a single fixture update (exclude current row from counts / order conflicts). */
export function validateFeaturedUpdateForFixture(
  matchId: string,
  wantFeatured: boolean,
  upcomingLocked: LiveFeaturedRow[]
): string | null {
  if (!wantFeatured) return null

  const self = upcomingLocked.find((r) => r.id === matchId)
  const others = upcomingLocked.filter((r) => r.id !== matchId)
  const featuredOthers = others.filter((r) => !!r.is_featured)
  const wasFeatured = !!self?.is_featured

  if (!wasFeatured && featuredOthers.length >= FEATURED_MATCHES_MAX) {
    return `Already ${FEATURED_MATCHES_MAX} featured upcoming/locked fixtures. Turn one off before adding another.`
  }
  return null
}
