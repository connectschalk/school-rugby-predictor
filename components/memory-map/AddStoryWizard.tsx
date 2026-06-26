'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { MemoryMapBundle, MemoryPin, RiskLevel } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'

type Props = {
  bundle: MemoryMapBundle
  initialPinId?: string | null
}

type WizardStep = 'access' | 'location' | 'pin' | 'details' | 'media' | 'review' | 'done'

export default function AddStoryWizard({ bundle, initialPinId }: Props) {
  const { map, areas, categories, pins } = bundle
  const [step, setStep] = useState<WizardStep>('access')
  const [approvedContributor] = useState(false) // TODO: wire Supabase membership
  const [locationMode, setLocationMode] = useState<string>('archive_submission')
  const [selectedPinId, setSelectedPinId] = useState<string | null>(initialPinId ?? null)
  const [newPinTitle, setNewPinTitle] = useState('')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('low')
  const [textBody, setTextBody] = useState('')
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)

  const nearbyPins = useMemo(
    () => pins.filter((p) => p.status === 'approved').slice(0, 6),
    [pins]
  )

  function next() {
    const order: WizardStep[] = ['access', 'location', 'pin', 'details', 'media', 'review', 'done']
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1]!)
  }

  function submit() {
    // TODO: persist via Supabase when contributor approved
    setStep('done')
  }

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />

      <div className="mx-auto max-w-lg px-4 py-6">
        {step === 'access' ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-black">Add a memory</h1>
            {!approvedContributor ? (
              <>
                <p className="mm-muted text-sm">
                  Sign in and request contributor access to submit memories for admin approval.
                </p>
                <Link href="/login" className="mm-btn-primary block rounded-2xl px-4 py-3 text-center text-sm font-black">
                  Sign in
                </Link>
                <button type="button" onClick={next} className="mm-btn-secondary w-full rounded-2xl px-4 py-3 text-sm font-bold">
                  Continue demo flow
                </button>
              </>
            ) : (
              <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
                Continue
              </button>
            )}
          </section>
        ) : null}

        {step === 'location' ? (
          <section className="space-y-4">
            <h2 className="text-xl font-black">Where did this happen?</h2>
            {[
              ['current_location', 'Use my current location'],
              ['manual_geo', 'Place manually on Geo Map'],
              ['manual_image_map', 'Place on School / Indoor Map'],
              ['archive_submission', 'Archive memory — I am not there'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocationMode(value)}
                className={`mm-card block w-full rounded-2xl p-4 text-left text-sm font-semibold ${
                  locationMode === value ? 'ring-2 ring-[var(--mm-accent)]' : ''
                }`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
              Continue
            </button>
          </section>
        ) : null}

        {step === 'pin' ? (
          <section className="space-y-4">
            <h2 className="text-xl font-black">Choose or create a pin</h2>
            <div className="space-y-2">
              {nearbyPins.map((pin: MemoryPin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => setSelectedPinId(pin.id)}
                  className={`mm-card w-full rounded-2xl p-3 text-left ${selectedPinId === pin.id ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
                >
                  <p className="font-bold">{pin.title}</p>
                  <p className="mm-muted text-xs">{areas.find((a) => a.id === pin.area_id)?.name}</p>
                </button>
              ))}
            </div>
            <input
              value={newPinTitle}
              onChange={(e) => setNewPinTitle(e.target.value)}
              placeholder="Or create new pin title"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
              Continue
            </button>
          </section>
        ) : null}

        {step === 'details' ? (
          <section className="space-y-3">
            <h2 className="text-xl font-black">Story details</h2>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Story title *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
            <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year happened *" type="number" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description *" rows={4} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm">
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
              <option value="admin_review">Admin review</option>
            </select>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={permissionConfirmed} onChange={(e) => setPermissionConfirmed(e.target.checked)} className="mt-1" />
              I confirm I have permission to submit this content
            </label>
            <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
              Continue
            </button>
          </section>
        ) : null}

        {step === 'media' ? (
          <section className="space-y-3">
            <h2 className="text-xl font-black">Add content</h2>
            <p className="mm-muted text-sm">Upload video, photos, or add a text-only memory. At least one is required.</p>
            <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Text story (optional)" rows={5} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
            <div className="mm-card rounded-2xl border-dashed p-6 text-center text-sm text-white/60">
              Media upload — connect storage in Phase 4
            </div>
            <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
              Review
            </button>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className="space-y-3">
            <h2 className="text-xl font-black">Review & submit</h2>
            <div className="mm-card space-y-2 rounded-2xl p-4 text-sm">
              <p><span className="mm-muted">Title:</span> {title || '—'}</p>
              <p><span className="mm-muted">Year:</span> {year}</p>
              <p><span className="mm-muted">Pin:</span> {selectedPinId ? pins.find((p) => p.id === selectedPinId)?.title : newPinTitle || 'New pin'}</p>
              <p><span className="mm-muted">Risk:</span> {riskLevel}</p>
            </div>
            <button
              type="button"
              disabled={!permissionConfirmed || !title || !description}
              onClick={submit}
              className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
            >
              Submit for approval
            </button>
          </section>
        ) : null}

        {step === 'done' ? (
          <section className="space-y-4 text-center">
            <h2 className="text-2xl font-black">Submitted</h2>
            <p className="mm-muted text-sm">Your memory has been submitted for school admin approval.</p>
            <Link href={`/memory-map/${map.slug}`} className="mm-btn-primary block rounded-2xl px-4 py-3 text-sm font-black">
              Back to map home
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  )
}
