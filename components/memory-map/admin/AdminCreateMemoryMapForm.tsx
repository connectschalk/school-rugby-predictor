'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import {
  CREATE_MAP_EXAMPLES,
  ORG_TYPE_LABELS,
  suggestCreateMapSlugs,
  suggestMemoryMapTitle,
} from '@/lib/memory-map/create-map-form'
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

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-bold text-white/90">
      {children}
    </label>
  )
}

function FieldHelper({ children }: { children: React.ReactNode }) {
  return <p className="mm-muted mt-1 text-xs leading-relaxed">{children}</p>
}

export default function AdminCreateMemoryMapForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showUrlSettings, setShowUrlSettings] = useState(false)

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

  const [mapTitleTouched, setMapTitleTouched] = useState(false)
  const [orgSlugTouched, setOrgSlugTouched] = useState(false)
  const [mapSlugTouched, setMapSlugTouched] = useState(false)

  function onOrgNameChange(value: string) {
    setOrgName(value)
    if (!mapTitleTouched) {
      setMapTitle(suggestMemoryMapTitle(value))
    }
    if (!orgSlugTouched || !mapSlugTouched) {
      const slugs = suggestCreateMapSlugs(value)
      if (!orgSlugTouched) setOrgSlug(slugs.orgSlug)
      if (!mapSlugTouched) setMapSlug(slugs.mapSlug)
    }
  }

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
    const finalMapSlug = slugify(mapSlug || mapTitle || orgName)
    if (!orgName.trim() || !mapTitle.trim()) {
      setError('Enter the school or place name and a Memory Map name.')
      setBusy(false)
      return
    }
    if (!finalOrgSlug || !finalMapSlug) {
      setError('Check the URL settings — a valid web address is required.')
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
      <div>
        <h1 className="text-2xl font-black">Create Memory Map</h1>
        <p className="mm-muted mt-2 text-sm leading-relaxed">
          Set up a new place-based story archive for a school, venue or event.
        </p>
      </div>
      {error ? <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <section className="mm-card space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="font-bold">Who is this map for?</h2>
          <FieldHelper>This is the organisation or place that owns the Memory Map.</FieldHelper>
        </div>

        <div>
          <FieldLabel htmlFor="org-name">School, place or event name</FieldLabel>
          <input
            id="org-name"
            required
            value={orgName}
            onChange={(e) => onOrgNameChange(e.target.value)}
            placeholder="e.g. Boishaai, Ons Huis, Interschools Committee"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <FieldLabel htmlFor="org-type">Type</FieldLabel>
          <select
            id="org-type"
            value={orgType}
            onChange={(e) => setOrgType(e.target.value as OrganisationType)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          >
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="org-description">Short description</FieldLabel>
          <FieldHelper>Optional. A sentence about the school, venue or event.</FieldHelper>
          <textarea
            id="org-description"
            value={orgDescription}
            onChange={(e) => setOrgDescription(e.target.value)}
            placeholder="e.g. A living archive of school rugby and hostel life."
            rows={2}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="mm-card space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="font-bold">Name your Memory Map</h2>
          <FieldHelper>This is the specific map people will open and explore.</FieldHelper>
        </div>

        <div>
          <FieldLabel htmlFor="map-title">Memory Map name</FieldLabel>
          <input
            id="map-title"
            required
            value={mapTitle}
            onChange={(e) => {
              setMapTitleTouched(true)
              setMapTitle(e.target.value)
            }}
            placeholder="e.g. Boishaai Memory Map"
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
          <p className="mm-muted font-bold uppercase tracking-wide text-white/50">Examples</p>
          <ul className="mm-muted mt-2 space-y-1">
            {CREATE_MAP_EXAMPLES.map((ex) => (
              <li key={ex.organisation}>
                <span className="text-white/70">{ex.organisation}</span>
                <span className="mx-1">→</span>
                <span>{ex.memoryMap}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowUrlSettings((v) => !v)}
            className="text-xs font-bold mm-text-accent underline-offset-2 hover:underline"
          >
            {showUrlSettings ? 'Hide URL settings' : 'Edit URL settings'}
          </button>
          {showUrlSettings ? (
            <div className="mt-3 space-y-3">
              <div>
                <FieldLabel htmlFor="org-slug">Organisation URL</FieldLabel>
                <FieldHelper>Short web-safe identifier for the organisation record.</FieldHelper>
                <input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(e) => {
                    setOrgSlugTouched(true)
                    setOrgSlug(e.target.value)
                  }}
                  placeholder="boishaai"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <FieldLabel htmlFor="map-slug">Memory Map URL</FieldLabel>
                <FieldHelper>The link people use to open this map.</FieldHelper>
                <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
                  <span className="mm-muted shrink-0 text-xs">/memory-map/</span>
                  <input
                    id="map-slug"
                    value={mapSlug}
                    onChange={(e) => {
                      setMapSlugTouched(true)
                      setMapSlug(e.target.value)
                    }}
                    placeholder="boishaai"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
              </div>
            </div>
          ) : mapSlug ? (
            <p className="mm-muted mt-2 text-xs">
              Map link: <span className="text-white/80">/memory-map/{mapSlug || slugify(orgName) || '…'}</span>
            </p>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="tagline">Tagline</FieldLabel>
          <FieldHelper>Optional. Shown on the map landing page.</FieldHelper>
          <input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Every place has a story."
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <FieldLabel htmlFor="map-description">Description</FieldLabel>
          <FieldHelper>Optional. A longer intro for visitors.</FieldHelper>
          <textarea
            id="map-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <FieldLabel htmlFor="visibility">Visibility</FieldLabel>
          <FieldHelper>Who can find and open this map.</FieldHelper>
          <select
            id="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as MapVisibility)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="private">Private — admins only</option>
            <option value="link_only">Link only — anyone with the link</option>
            <option value="public">Public — listed in the directory</option>
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="status">Status</FieldLabel>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as MapStatus)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="draft">Draft — set up before going live</option>
            <option value="active">Active — ready for contributors</option>
          </select>
        </div>
      </section>

      <section className="mm-card space-y-3 rounded-2xl p-4">
        <h2 className="font-bold">Branding</h2>
        <FieldHelper>Optional. Logo and colours for the map landing page.</FieldHelper>
        <label className="block text-xs">
          <span className="mm-muted">Profile image</span>
          <input type="file" accept="image/*" onChange={(e) => setProfileFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-xs" />
        </label>
        <label className="block text-xs">
          <span className="mm-muted">Background image</span>
          <input type="file" accept="image/*" onChange={(e) => setBackgroundFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-xs" />
        </label>
        <div className="flex gap-3">
          <label className="text-xs">
            Primary <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="ml-1" />
          </label>
          <label className="text-xs">
            Accent <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="ml-1" />
          </label>
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
