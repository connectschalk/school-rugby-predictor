'use client'

import type { ReactNode } from 'react'
import AdSlot from '@/components/advertising/AdSlot'
import { interleaveWithInlineAds } from '@/lib/advertising/interleave'
import type { AdPlacementId } from '@/lib/advertising/placements'
import type { AdRenderContext } from '@/lib/advertising/ad-provider'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'

type Props<T> = {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  /** When demo is on, wrap the first item with this (e.g. sponsored match). */
  renderFirstWrapper?: (item: T, node: ReactNode) => ReactNode
  placement?: AdPlacementId
  context?: AdRenderContext
  interval?: number
  refreshKey?: string | number
  className?: string
}

/** Renders a vertical list with optional Nova demo inline adverts. */
export default function InlineAdList<T>({
  items,
  getKey,
  renderItem,
  renderFirstWrapper,
  placement = 'nova_predictor_fixture_inline',
  context,
  interval = 5,
  refreshKey,
  className = 'space-y-2',
}: Props<T>) {
  const { enabled } = useNovaDemo()
  const sequence = enabled ? interleaveWithInlineAds(items, interval) : null

  if (!sequence) {
    return (
      <div className={className}>
        {items.map((item, index) => {
          const node = renderItem(item, index)
          const wrapped =
            index === 0 && renderFirstWrapper ? renderFirstWrapper(item, node) : node
          return <div key={getKey(item)}>{wrapped}</div>
        })}
      </div>
    )
  }

  return (
    <div className={className}>
      {sequence.map((entry) => {
        if (entry.type === 'ad') {
          return (
            <AdSlot
              key={entry.adKey}
              placement={placement}
              context={context}
              refreshKey={refreshKey}
              className="my-1"
            />
          )
        }
        const node = renderItem(entry.item, entry.index)
        const wrapped =
          entry.index === 0 && renderFirstWrapper
            ? renderFirstWrapper(entry.item, node)
            : node
        return <div key={getKey(entry.item)}>{wrapped}</div>
      })}
    </div>
  )
}
