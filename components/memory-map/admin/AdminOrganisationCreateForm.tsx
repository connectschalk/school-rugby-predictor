'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ORG_TYPE_LABELS, ORG_TYPE_OPTIONS, suggestCreateMapSlugs } from '@/lib/memory-map/create-map-form'
import { createMemoryMapOrganisation } from '@/lib/memory-map/organisations'
import type { OrganisationType } from '@/lib/memory-map/types'
import { slugify } from '@/lib/memory-map/validation'

export default function AdminOrganisationCreateForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState<OrganisationType>('school')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#FFD400')
  const [secondaryColor, setSecondaryColor] = useState('#005DAA')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function onNameChange(value: string) {
    setName(value)
    if (!slugTouched) {
      setSlug(suggestCreateMapSlugs(value).orgSlug)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    const finalSlug = slugify(slug || name)
    if (!name.trim() || !finalSlug) {
      setError('Enter a name and valid slug.')
      setBusy(false)
      return
    }

    const { organisationId, error: createErr } = await createMemoryMapOrganisation(supabase, {
      name: name.trim(),
      type,
      slug: finalSlug,
      description: description.trim(),
      logoUrl: logoUrl.trim() || undefined,
      primaryColor,
      secondaryColor,
    })

    setBusy(false)
    if (createErr || !organisationId) {
      setError(createErr ?? 'Could not create organisation.')
      return
    }

    router.push(`/memory-map/admin/organisations/${organisationId}`)
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <p className="mm-text-accent text-xs font-bold uppercase tracking-[0.25em]">Platform admin</p>
      <h1 className="mt-3 text-2xl font-black">Create organisation</h1>
      <p className="mm-muted mt-2 text-sm">Add a school, event, place or organisation before creating Memory Maps.</p>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-white/70">Organisation name</label>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-white/70">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OrganisationType)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          >
            {ORG_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-white/70">Slug</label>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-white/70">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-white/70">Logo URL (optional)</label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="mm-input w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-white/70">Primary colour</label>
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-full" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-white/70">Secondary colour</label>
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-full" />
          </div>
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={busy} className="mm-btn-primary w-full rounded-2xl py-3 text-sm font-black disabled:opacity-50">
          {busy ? 'Creating…' : 'Create organisation'}
        </button>
      </form>

      <Link href="/memory-map/admin/organisations" className="mm-muted mt-6 block text-center text-sm font-bold underline underline-offset-4">
        Back to organisations
      </Link>
    </main>
  )
}
