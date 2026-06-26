'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateMemoryMapSponsor } from '@/lib/memory-map/mutations'
import { MM_BUCKET_SPONSORS, MM_MAX_SPONSOR_BYTES, uploadMemoryMapImage } from '@/lib/memory-map/storage'
import type { MemoryMap } from '@/lib/memory-map/types'

type PlacementKey = 'landing' | 'map_header' | 'story_footer' | 'qr'

const PLACEMENT_LABELS: Record<PlacementKey, string> = {
  landing: 'Landing page',
  map_header: 'Map header',
  story_footer: 'Story detail footer',
  qr: 'QR / share page',
}

type Props = {
  map: MemoryMap
  onSaved: (map: MemoryMap) => void
}

export default function AdminSponsorForm({ map, onSaved }: Props) {
  const [sponsorName, setSponsorName] = useState(map.sponsor_name ?? '')
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState(map.sponsor_logo_url ?? '')
  const [sponsorWebsite, setSponsorWebsite] = useState(map.sponsor_website_url ?? '')
  const [sponsorMessage, setSponsorMessage] = useState(map.sponsor_message ?? '')
  const [placements, setPlacements] = useState<Record<PlacementKey, boolean>>({
    landing: true,
    map_header: true,
    story_footer: true,
    qr: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function onLogoFile(file: File | null) {
    if (!file) return
    const up = await uploadMemoryMapImage(supabase, MM_BUCKET_SPONSORS, map.id, 'logo', file, MM_MAX_SPONSOR_BYTES)
    if ('error' in up) {
      setError(up.error)
      return
    }
    setSponsorLogoUrl(up.url)
    setError('')
  }

  async function onSave() {
    setSaving(true)
    setError('')
    setMessage('')
    const { error: err } = await updateMemoryMapSponsor(supabase, map.id, {
      sponsor_name: sponsorName.trim(),
      sponsor_logo_url: sponsorLogoUrl,
      sponsor_website_url: sponsorWebsite.trim(),
      sponsor_message: sponsorMessage.trim(),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setMessage('Sponsor saved.')
    onSaved({
      ...map,
      sponsor_name: sponsorName.trim() || null,
      sponsor_logo_url: sponsorLogoUrl || null,
      sponsor_website_url: sponsorWebsite.trim() || null,
      sponsor_message: sponsorMessage.trim() || null,
    })
  }

  return (
    <div className="mm-card space-y-4 rounded-2xl p-4">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <label className="block text-sm">
        <span className="mm-muted mb-1 block text-xs">Sponsor logo</span>
        {sponsorLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsorLogoUrl} alt="" className="mb-2 h-12 w-auto max-w-[160px] rounded object-contain bg-white/10 p-1" />
        ) : null}
        <input type="file" accept="image/*" onChange={(e) => void onLogoFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
      </label>

      <input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Sponsor name" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <input value={sponsorWebsite} onChange={(e) => setSponsorWebsite(e.target.value)} placeholder="Sponsor website URL" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <textarea value={sponsorMessage} onChange={(e) => setSponsorMessage(e.target.value)} placeholder="Sponsor message" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">Placement (all enabled for MVP)</p>
        {(Object.keys(PLACEMENT_LABELS) as PlacementKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={placements[key]}
              onChange={(e) => setPlacements((p) => ({ ...p, [key]: e.target.checked }))}
            />
            {PLACEMENT_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="mm-card rounded-xl p-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Preview</p>
        <p className="mt-2 text-sm">Proudly sponsored by <span className="font-bold">{sponsorName || 'Your sponsor'}</span></p>
        {sponsorLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsorLogoUrl} alt="" className="mx-auto mt-2 h-10 object-contain" />
        ) : null}
      </div>

      <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save sponsor'}
      </button>
    </div>
  )
}
