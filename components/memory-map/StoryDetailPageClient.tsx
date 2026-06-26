'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import StoryDetailView from '@/components/memory-map/StoryDetailView'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import { fetchAdminMemoryMapBundleClient } from '@/lib/memory-map/client-queries'
import type { MemoryMapBundle, MemoryStory } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MmEmptyState from '@/components/memory-map/MmEmptyState'

type Props = {
  publicBundle: MemoryMapBundle
  storyId: string
  mapSlug: string
}

export default function StoryDetailPageClient({ publicBundle, storyId, mapSlug }: Props) {
  const publicStory = publicBundle.stories.find((s) => s.id === storyId) ?? null
  const [bundle, setBundle] = useState(publicBundle)
  const [story, setStory] = useState<MemoryStory | null>(publicStory)
  const [isAdminView, setIsAdminView] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const access = await fetchContributorAccess(supabase, publicBundle.map.id)
      if (cancelled) return

      if (access.isMapAdmin) {
        const adminBundle = await fetchAdminMemoryMapBundleClient(supabase, publicBundle.map.id)
        if (cancelled) return
        if (adminBundle) {
          setBundle(adminBundle)
          const s = adminBundle.stories.find((st) => st.id === storyId) ?? null
          if (s) {
            setStory(s)
            setIsAdminView(s.status !== 'approved')
            setUnavailable(false)
          } else {
            setUnavailable(true)
          }
        }
      } else if (!publicStory || publicStory.status !== 'approved') {
        setUnavailable(true)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [publicBundle, storyId, publicStory])

  if (loading) {
    return (
      <div className="mm-root flex min-h-dvh items-center justify-center text-sm text-white/70" style={memoryMapThemeVars(publicBundle.map)}>
        Loading story…
      </div>
    )
  }

  if (unavailable || !story) {
    return (
      <div style={memoryMapThemeVars(publicBundle.map)}>
        <MmEmptyState
          title="This story is no longer available"
          description="It may be pending review, rejected, or removed."
          icon="📖"
          action={
            <Link href={`/memory-map/${mapSlug}/map`} className="mm-btn-primary block rounded-xl px-4 py-3 text-sm font-black">
              Back to map
            </Link>
          }
        />
      </div>
    )
  }

  return <StoryDetailView bundle={bundle} story={story} isAdminView={isAdminView} />
}
