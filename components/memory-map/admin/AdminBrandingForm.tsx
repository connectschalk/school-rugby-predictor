'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { updateMemoryMapBranding } from '@/lib/memory-map/mutations'
import {
  MM_BUCKET_BACKGROUNDS,
  MM_BUCKET_BRANDING,
  MM_MAX_BACKGROUND_BYTES,
  MM_MAX_PROFILE_BYTES,
  uploadMemoryMapImage,
} from '@/lib/memory-map/storage'
import type { MemoryMap } from '@/lib/memory-map/types'
import { contrastRatio, DEFAULT_MEMORY_MAP_BRANDING } from '@/lib/memory-map/utils'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapLandingPage from '@/components/memory-map/MemoryMapLandingPage'
import AdminMapStartPointForm from '@/components/memory-map/admin/AdminMapStartPointForm'

type Props = {
  map: MemoryMap
  onSaved: (map: MemoryMap) => void
}

export default function AdminBrandingForm({ map, onSaved }: Props) {
  const [title, setTitle] = useState(map.title)
  const [tagline, setTagline] = useState(map.tagline ?? '')
  const [profileUrl, setProfileUrl] = useState(map.profile_image_url ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(map.landing_background_url ?? '')
  const [primaryColor, setPrimaryColor] = useState(map.primary_color)
  const [primaryTextColor, setPrimaryTextColor] = useState(map.primary_text_color)
  const [secondaryColor, setSecondaryColor] = useState(map.secondary_color)
  const [secondaryTextColor, setSecondaryTextColor] = useState(map.secondary_text_color)
  const [accentColor, setAccentColor] = useState(map.accent_color)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function onProfileFile(file: File | null) {
    if (!file) return
    const up = await uploadMemoryMapImage(supabase, MM_BUCKET_BRANDING, map.id, 'profile', file, MM_MAX_PROFILE_BYTES)
    if ('error' in up) {
      setError(up.error)
      return
    }
    setProfileUrl(up.url)
    setError('')
  }

  async function onBackgroundFile(file: File | null) {
    if (!file) return
    const up = await uploadMemoryMapImage(
      supabase,
      MM_BUCKET_BACKGROUNDS,
      map.id,
      'landing',
      file,
      MM_MAX_BACKGROUND_BYTES
    )
    if ('error' in up) {
      setError(up.error)
      return
    }
    setBackgroundUrl(up.url)
    setError('')
  }

  async function onSave() {
    setSaving(true)
    setError('')
    setMessage('')
    const { error: err } = await updateMemoryMapBranding(supabase, map.id, {
      title: title.trim(),
      tagline: tagline.trim(),
      profile_image_url: profileUrl,
      landing_background_url: backgroundUrl,
      primary_color: primaryColor,
      primary_text_color: primaryTextColor,
      secondary_color: secondaryColor,
      secondary_text_color: secondaryTextColor,
      accent_color: accentColor,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setMessage('Branding saved.')
    onSaved({
      ...map,
      title: title.trim(),
      tagline: tagline.trim() || null,
      profile_image_url: profileUrl || null,
      landing_background_url: backgroundUrl || null,
      primary_color: primaryColor,
      primary_text_color: primaryTextColor,
      secondary_color: secondaryColor,
      secondary_text_color: secondaryTextColor,
      accent_color: accentColor,
    })
  }

  const contrast = contrastRatio(primaryTextColor, primaryColor)
  const contrastWarn = contrast < 4.5

  function onReset() {
    setPrimaryColor(DEFAULT_MEMORY_MAP_BRANDING.primary_color)
    setPrimaryTextColor(DEFAULT_MEMORY_MAP_BRANDING.primary_text_color)
    setSecondaryColor(DEFAULT_MEMORY_MAP_BRANDING.secondary_color)
    setSecondaryTextColor(DEFAULT_MEMORY_MAP_BRANDING.secondary_text_color)
    setAccentColor(DEFAULT_MEMORY_MAP_BRANDING.accent_color)
  }

  const previewMap: MemoryMap = {
    ...map,
    title: title.trim() || map.title,
    tagline: tagline.trim() || null,
    profile_image_url: profileUrl || null,
    landing_background_url: backgroundUrl || null,
    primary_color: primaryColor,
    primary_text_color: primaryTextColor,
    secondary_color: secondaryColor,
    secondary_text_color: secondaryTextColor,
    accent_color: accentColor,
  }

  return (
    <div className="space-y-4">
    <div className="mm-card space-y-4 rounded-2xl p-4">
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-green-300">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mm-muted mb-1 block text-xs">Profile / logo (square works best, max 5 MB)</span>
          {profileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileUrl} alt="" className="mb-2 h-16 w-16 rounded-xl object-cover" />
          ) : null}
          <input type="file" accept="image/*" onChange={(e) => void onProfileFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        </label>
        <label className="block text-sm">
          <span className="mm-muted mb-1 block text-xs">Landing background (wide landscape, max 10 MB)</span>
          {backgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backgroundUrl} alt="" className="mb-2 h-16 w-full rounded-xl object-cover" />
          ) : null}
          <input type="file" accept="image/*" onChange={(e) => void onBackgroundFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        </label>
      </div>

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
      <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ['Primary', primaryColor, setPrimaryColor],
            ['Primary text', primaryTextColor, setPrimaryTextColor],
            ['Secondary', secondaryColor, setSecondaryColor],
            ['Secondary text', secondaryTextColor, setSecondaryTextColor],
            ['Accent', accentColor, setAccentColor],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} className="text-xs">
            <span className="mm-muted block">{label}</span>
            <input type="color" value={value.startsWith('#') ? value : '#FFD400'} onChange={(e) => setter(e.target.value)} className="mt-1 h-9 w-full cursor-pointer rounded border border-white/15 bg-transparent" />
          </label>
        ))}
      </div>

      {contrastWarn ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Primary button text may have poor contrast ({contrast.toFixed(1)}:1). Aim for 4.5:1 or higher.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
      <button type="button" disabled={saving} onClick={() => void onSave()} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save branding'}
      </button>
      <button type="button" onClick={onReset} className="mm-btn-secondary rounded-xl px-4 py-2 text-sm font-bold">
        Reset to NextPlay default
      </button>
      </div>
    </div>

    <div className="mm-card overflow-hidden rounded-2xl">
      <p className="border-b border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/60">Landing preview</p>
      <div className="mm-root max-h-[420px] overflow-y-auto" style={memoryMapThemeVars(previewMap)}>
        <MemoryMapLandingPage map={previewMap} mapSlug={map.slug} />
      </div>
    </div>

    <AdminMapStartPointForm map={map} onSaved={onSaved} />
    </div>
  )
}
