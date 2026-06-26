'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import { createMemoryMapPlatform } from '@/lib/memory-map/mutations'
import { slugify } from '@/lib/memory-map/validation'
import {
  MM_BUCKET_BACKGROUNDS,
  MM_BUCKET_BRANDING,
  MM_BUCKET_SPONSORS,
  MM_MAX_BACKGROUND_BYTES,
  MM_MAX_PROFILE_BYTES,
  MM_MAX_SPONSOR_BYTES,
  uploadMemoryMapImage,
} from '@/lib/memory-map/storage'
import type { MapStatus, MapVisibility, OrganisationType } from '@/lib/memory-map/types'

const ORG_TYPES: OrganisationType[] = ['school', 'event', 'venue', 'club', 'community']

export default function AdminCreateMemoryMapForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState<OrganisationType>('school')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [mapTitle, setMapTitle] = useState('')
  const [mapSlug, setMapSlug] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<MapVisibility>('link_only')
  const [status, setStatus] = useState<MapStatus>('draft')
  const [primaryColor, setPrimaryColor] = useState('#FFD400')
  const [accentColor, setAccentColor] = useState('#FFD400')
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null)
  const [sponsorName, setSponsorName] = useState('')
  const [sponsorLogoFile, setSponsorLogoFile] = useState<File | null>(null)
  const [sponsorWebsite, setSponsorWebsite] = useState('')
  const [sponsorMessage, setSponsorMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    const { isAdmin } = await fetchUserIsAdmin(supabase, (await supabase.auth.getSession()).data.session?.user?.id ?? '')
    if (!isAdmin) {
      setError('Only platform admins can create Memory Maps.')
      setBusy(false)
      return
    }

    const finalOrgSlug = slugify(orgSlug || orgName)
    const finalMapSlug = slugify(mapSlug || mapTitle)
    if (!finalOrgSlug || !finalMapSlug) {
      setError('Valid organisation and map slugs are required.')
      setBusy(false)
      return
    }

    const { mapId, error: createErr } = await createMemoryMapPlatform(supabase, {
      orgName: orgName.trim(),
      orgType,
      orgSlug: finalOrgSlug,
      orgDescription: orgDescription.trim(),
      mapTitle: mapTitle.trim(),
      mapSlug: finalMapSlug,
      tagline: tagline.trim(),
      description: description.trim(),
      visibility,
      status,
      primaryColor,
      accentColor,
      sponsorName: sponsorName.trim(),
      sponsorWebsiteUrl: sponsorWebsite.trim(),
      sponsorMessage: sponsorMessage.trim(),
    })

    if (createErr || !mapId) {
      setError(createErr ?? 'Could not create Memory Map.')
      setBusy(false)
      return
    }

    let profileUrl = ''
    let backgroundUrl = ''
    let sponsorLogoUrl = ''
    if (profileFile) {
      const up = await uploadMemoryMapImage(supabase, MM_BUCKET_BRANDING, mapId, 'profile', profileFile, MM_MAX_PROFILE_BYTES)
      if ('error' in up) {
        setError(up.error)
        setBusy(false)
        return
      }
      profileUrl = up.url
    }
    if (backgroundFile) {
      const up = await uploadMemoryMapImage(supabase, MM_BUCKET_BACKGROUNDS, mapId, 'landing', backgroundFile, MM_MAX_BACKGROUND_BYTES)
      if ('error' in up) {
        setError(up.error)
        setBusy(false)
        return
      }
      backgroundUrl = up.url
    }
    if (sponsorLogoFile) {
      const up = await uploadMemoryMapImage(supabase, MM_BUCKET_SPONSORS, mapId, 'logo', sponsorLogoFile, MM_MAX_SPONSOR_BYTES)
      if ('error' in up) {
        setError(up.error)
        setBusy(false)
        return
      }
      sponsorLogoUrl = up.url
    }

    if (profileUrl || backgroundUrl) {
      await supabase.rpc('update_memory_map_branding', {
        p_map_id: mapId,
        p_title: mapTitle.trim(),
        p_tagline: tagline.trim(),
        p_profile_image_url: profileUrl,
        p_landing_background_url: backgroundUrl,
        p_primary_color: primaryColor,
        p_primary_text_color: '#050505',
        p_secondary_color: 'transparent',
        p_secondary_text_color: '#FFFFFF',
        p_accent_color: accentColor,
      })
    }
    if (sponsorName && sponsorLogoUrl) {
      await supabase.rpc('update_memory_map_sponsor', {
        p_map_id: mapId,
        p_sponsor_name: sponsorName.trim(),
        p_sponsor_logo_url: sponsorLogoUrl,
        p_sponsor_website_url: sponsorWebsite.trim(),
        p_sponsor_message: sponsorMessage.trim(),
      })
    }

    router.push(`/memory-map/admin/${mapId}`)
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <h1 className="text-2xl font-black">Create Memory Map</h1>
      {error ? <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <section className="mm-card space-y-3 rounded-2xl p-4">
        <h2 className="font-bold">Organisation</h2>
        <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <select value={orgType} onChange={(e) => setOrgType(e.target.value as OrganisationType)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
          {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} placeholder="Organisation slug" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <textarea value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      </section>

      <section className="mm-card space-y-3 rounded-2xl p-4">
        <h2 className="font-bold">Memory Map</h2>
        <input required value={mapTitle} onChange={(e) => setMapTitle(e.target.value)} placeholder="Memory Map title *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <input value={mapSlug} onChange={(e) => setMapSlug(e.target.value)} placeholder="Map slug (URL)" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as MapVisibility)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
          <option value="private">Private</option>
          <option value="link_only">Link only</option>
          <option value="public">Public</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as MapStatus)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
        </select>
      </section>

      <section className="mm-card space-y-3 rounded-2xl p-4">
        <h2 className="font-bold">Branding</h2>
        <input type="file" accept="image/*" onChange={(e) => setProfileFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        <input type="file" accept="image/*" onChange={(e) => setBackgroundFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        <div className="flex gap-3">
          <label className="text-xs">Primary <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="ml-1" /></label>
          <label className="text-xs">Accent <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="ml-1" /></label>
        </div>
      </section>

      <section className="mm-card space-y-3 rounded-2xl p-4">
        <h2 className="font-bold">Sponsor (optional)</h2>
        <input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Sponsor name" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <input type="file" accept="image/*" onChange={(e) => setSponsorLogoFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        <input value={sponsorWebsite} onChange={(e) => setSponsorWebsite(e.target.value)} placeholder="Website" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <textarea value={sponsorMessage} onChange={(e) => setSponsorMessage(e.target.value)} placeholder="Message" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      </section>

      <button type="submit" disabled={busy} className="mm-btn-primary w-full rounded-2xl py-4 text-sm font-black disabled:opacity-50">
        {busy ? 'Creating…' : 'Create Memory Map'}
      </button>
    </form>
  )
}
