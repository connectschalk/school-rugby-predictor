/**
 * Helpers for inserting inline adverts into fixture/predict lists.
 * Pure functions — safe to unit test without React.
 */

import { inlineAdInsertIndices } from '@/lib/advertising/placements'

export type InterleavedItem<T> =
  | { type: 'item'; item: T; index: number }
  | { type: 'ad'; afterIndex: number; adKey: string }

/**
 * Interleave ad markers after every `interval` items.
 * Never inserts an advert after the final item.
 */
export function interleaveWithInlineAds<T>(
  items: T[],
  interval = 5,
  adKeyPrefix = 'inline-ad'
): InterleavedItem<T>[] {
  const insertAt = new Set(inlineAdInsertIndices(items.length, interval))
  const out: InterleavedItem<T>[] = []
  items.forEach((item, index) => {
    out.push({ type: 'item', item, index })
    // Insert after this item when the next index is an insert point
    // inlineAdInsertIndices returns indices where an ad should appear *before* that item index
    // i.e. after items[0..i-1], at position i in the list.
    if (insertAt.has(index + 1)) {
      out.push({ type: 'ad', afterIndex: index, adKey: `${adKeyPrefix}-${index}` })
    }
  })
  return out
}

/** Flatten day-grouped matches into a single sequence for global insert indexing. */
export function flattenMatchGroups<T>(groups: { matches: T[] }[]): T[] {
  return groups.flatMap((g) => g.matches)
}
