'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchAdminMemoryMapBundleClient } from '@/lib/memory-map/client-queries'
import type { MemoryMapBundle } from '@/lib/memory-map/types'
import { absoluteMemoryMapUrl } from '@/lib/site-url'

type StepStatus = 'done' | 'attention' | 'optional'

type Props = {
  mapId: string
}

type Step = {
  id: string
  title: string
  status: StepStatus
  tab: string
  hint: string
}

function stepStatus(ok: boolean, optional = false): StepStatus {
  if (ok) return 'done'
  if (optional) return 'optional'
  return 'attention'
}

export default function AdminSetupWizard({ mapId }: Props) {
  const [bundle, setBundle] = useState<MemoryMapBundle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const b = await fetchAdminMemoryMapBundleClient(supabase, mapId)
      setBundle(b)
      setLoading(false)
    })()
  }, [mapId])

  if (loading) {
    return <div className="mm-root flex min-h-dvh items-center justify-center text-sm text-white/70">Loading setup…</div>
  }

  if (!bundle) {
    return <div className="mm-root flex min-h-dvh items-center justify-center text-sm text-white/70">Could not load map.</div>
  }

  const { map, areas, categories, pins, stories } = bundle
  const approvedStories = stories.filter((s) => s.status === 'approved')
  const activeAreas = areas.filter((a) => a.is_active)

  const steps: Step[] = [
    {
      id: 'brand',
      title: 'Brand your Memory Map',
      status: stepStatus(Boolean(map.profile_image_url && map.landing_background_url)),
      tab: 'branding',
      hint: 'Upload profile and background images.',
    },
    {
      id: 'area',
      title: 'Add your first area',
      status: stepStatus(activeAreas.length > 0),
      tab: 'areas',
      hint: 'Create at least one active map area.',
    },
    {
      id: 'categories',
      title: 'Review categories',
      status: stepStatus(categories.some((c) => c.is_active)),
      tab: 'categories',
      hint: 'Default categories are seeded — review and adjust.',
    },
    {
      id: 'sponsor',
      title: 'Add sponsor (optional)',
      status: stepStatus(Boolean(map.sponsor_name), true),
      tab: 'sponsor',
      hint: 'Optional partner branding.',
    },
    {
      id: 'contributors',
      title: 'Invite contributors',
      status: 'optional',
      tab: 'contributors',
      hint: 'Share invite links with old boys and staff.',
    },
    {
      id: 'qr',
      title: 'Generate QR poster',
      status: stepStatus(Boolean(map.slug)),
      tab: 'share',
      hint: 'Print or download your on-site QR poster.',
    },
    {
      id: 'checklist',
      title: 'Review pilot checklist',
      status: stepStatus(approvedStories.length > 0 && pins.some((p) => p.status === 'approved')),
      tab: 'pilot',
      hint: 'Confirm content and access before launch.',
    },
  ]

  const doneCount = steps.filter((s) => s.status === 'done').length
  const base = `/memory-map/admin/${mapId}`

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div>
        <Link href={base} className="text-xs font-bold text-[var(--mm-accent)]">
          ← Admin dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-black">Pilot setup</h1>
        <p className="mm-muted mt-1 text-sm">
          {map.title} · {doneCount}/{steps.length} steps complete
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <Link
            key={step.id}
            href={`${base}?tab=${step.tab}`}
            className="mm-card flex items-start gap-3 rounded-2xl p-4 transition hover:border-white/25"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                step.status === 'done'
                  ? 'bg-green-500/20 text-green-400'
                  : step.status === 'optional'
                    ? 'bg-white/10 text-white/50'
                    : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {step.status === 'done' ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-bold">{step.title}</p>
              <p className="mm-muted text-xs">{step.hint}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-white/40">
                {step.status === 'done' ? 'Completed' : step.status === 'optional' ? 'Optional' : 'Needs attention'}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <Link href={base} className="mm-btn-primary block rounded-2xl px-5 py-4 text-center text-sm font-black">
        Finish setup and open admin dashboard
      </Link>

      <p className="mm-muted text-center text-[10px]">Public URL: {absoluteMemoryMapUrl(map.slug)}</p>
    </div>
  )
}
