'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildLoginHref } from '@/lib/auth-return-path'
import type { ContributorAccess } from '@/lib/memory-map/membership'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import { requestContributorAccess, submitMemoryStory, type StoryMediaPayload } from '@/lib/memory-map/mutations'
import { uploadPendingStoryMedia } from '@/lib/memory-map/storage'
import { trackMemoryMapEvent } from '@/lib/memory-map/analytics'
import {
  MM_MAX_PHOTOS_PER_STORY,
  MM_MAX_VIDEOS_PER_STORY,
  validateImageFile,
  validateStoryContent,
  validateVideoFile,
} from '@/lib/memory-map/validation'
import type { MemoryMapBundle, MemoryPin, RiskLevel, StoryType, UploadMode, MapPlacement } from '@/lib/memory-map/types'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import MapCanvas from '@/components/memory-map/MapCanvas'
import MmEmptyState from '@/components/memory-map/MmEmptyState'

type Props = {
  bundle: MemoryMapBundle
  initialPinId?: string | null
}

type WizardStep = 'access' | 'location' | 'pin' | 'details' | 'media' | 'review' | 'done'

const STEPS: WizardStep[] = ['access', 'location', 'pin', 'details', 'media', 'review', 'done']
const STEP_LABELS: Record<WizardStep, string> = {
  access: 'Access',
  location: 'Location',
  pin: 'Pin',
  details: 'Details',
  media: 'Media',
  review: 'Review',
  done: 'Done',
}

function WizardProgress({ step }: { step: WizardStep }) {
  if (step === 'done') return null
  const idx = STEPS.indexOf(step)
  return (
    <div className="mb-6">
      <div className="flex gap-1">
        {STEPS.slice(0, -1).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-[var(--mm-accent)]' : 'bg-white/10'}`} />
        ))}
      </div>
      <p className="mm-muted mt-2 text-xs">Step {idx + 1} of {STEPS.length - 1}: {STEP_LABELS[step]}</p>
    </div>
  )
}

function inferStoryType(hasVideo: boolean, hasPhoto: boolean, hasText: boolean): StoryType {
  if (hasVideo && (hasPhoto || hasText)) return 'mixed'
  if (hasVideo) return 'video'
  if (hasPhoto && hasText) return 'mixed'
  if (hasPhoto) return 'photo'
  return 'text'
}

export default function AddStoryWizard({ bundle, initialPinId }: Props) {
  const { map, areas, categories, pins } = bundle
  const [step, setStep] = useState<WizardStep>('access')
  const [access, setAccess] = useState<ContributorAccess | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [relationship, setRelationship] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const [locationMode, setLocationMode] = useState<UploadMode>('archive_submission')
  const [selectedAreaId, setSelectedAreaId] = useState(areas[0]?.id ?? '')
  const [selectedPinId, setSelectedPinId] = useState<string | null>(initialPinId ?? null)
  const [newPinTitle, setNewPinTitle] = useState('')
  const [pinPlacement, setPinPlacement] = useState<MapPlacement | null>(null)
  const [placingPin, setPlacingPin] = useState(false)

  const [title, setTitle] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('low')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [textBody, setTextBody] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [pinSearch, setPinSearch] = useState('')
  const [useExistingPinOnly, setUseExistingPinOnly] = useState(Boolean(initialPinId))
  const [uploadProgress, setUploadProgress] = useState('')
  const [mediaWarning, setMediaWarning] = useState('')
  const [failedFileName, setFailedFileName] = useState<string | null>(null)

  const returnPath = `/memory-map/${map.slug}/add${initialPinId ? `?pin=${initialPinId}` : ''}`

  const loadAccess = useCallback(async () => {
    setAccessLoading(true)
    const a = await fetchContributorAccess(supabase, map.id)
    setAccess(a)
    setAccessLoading(false)
  }, [map.id])

  useEffect(() => {
    void loadAccess()
  }, [loadAccess])

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0]
  const nearbyPins = useMemo(() => {
    const q = pinSearch.trim().toLowerCase()
    return pins
      .filter((p) => p.status === 'approved' && (!selectedArea || p.area_id === selectedArea.id))
      .filter((p) => !q || p.title.toLowerCase().includes(q))
  }, [pins, selectedArea, pinSearch])

  function requestGeo() {
    if (!navigator.geolocation) {
      setGeoMessage('Geolocation is not supported in this browser.')
      return
    }
    setGeoMessage('Requesting location…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPinPlacement({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationMode('current_location')
        setGeoMessage('Location captured. Choose or create a pin nearby.')
      },
      () => setGeoMessage('Location permission denied. Try manual placement instead.')
    )
  }

  function next() {
    const order: WizardStep[] = ['access', 'location', 'pin', 'details', 'media', 'review', 'done']
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1]!)
  }

  async function onRequestAccess() {
    setError('')
    const { error: err } = await requestContributorAccess(supabase, map.id, relationship, requestMessage)
    if (err) {
      setError(err)
      return
    }
    setRequestSent(true)
    void trackMemoryMapEvent(supabase, {
      memoryMapId: map.id,
      eventType: 'contributor_request_submitted',
    })
    await loadAccess()
  }

  function addPhotoFiles(files: File[]) {
    setError('')
    setFailedFileName(null)
    const next: File[] = [...photoFiles]
    for (const file of files) {
      if (next.length >= MM_MAX_PHOTOS_PER_STORY) {
        setError(`Maximum ${MM_MAX_PHOTOS_PER_STORY} photos per story.`)
        break
      }
      const result = validateImageFile(file)
      if (!result.ok) {
        setError(result.error)
        continue
      }
      next.push(file)
    }
    setPhotoFiles(next)
  }

  function setVideo(file: File | null) {
    setError('')
    setFailedFileName(null)
    setMediaWarning('')
    if (!file) {
      setVideoFile(null)
      return
    }
    if (videoFile || file) {
      const result = validateVideoFile(file)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.warning) setMediaWarning(result.warning)
      setVideoFile(file)
    }
  }

  async function uploadMediaWithProgress(): Promise<StoryMediaPayload[]> {
    const payloads: StoryMediaPayload[] = []
    let sort = 0
    const files: { file: File; kind: 'video' | 'image' }[] = []
    if (videoFile) files.push({ file: videoFile, kind: 'video' })
    for (const f of photoFiles) files.push({ file: f, kind: 'image' })

    for (const { file, kind } of files) {
      setUploadProgress(`Uploading ${file.name}…`)
      const up = await uploadPendingStoryMedia(supabase, map.id, file, sort++)
      if ('error' in up) {
        setFailedFileName(file.name)
        throw new Error(`Upload failed for ${file.name}: ${up.error}`)
      }
      payloads.push({
        ...up,
        // Images use file URL as thumbnail; video thumbnails need server-side generation.
        thumbnail_url: kind === 'image' ? up.file_url : null,
      })
    }
    return payloads
  }

  async function onSubmit() {
    setError('')
    setFailedFileName(null)
    const eventYear = parseInt(year, 10)
    const finalDescription = [description.trim(), textBody.trim()].filter(Boolean).join('\n\n')
    const hasText = Boolean(textBody.trim() || description.trim())
    const hasPhoto = photoFiles.length > 0
    const hasVideo = Boolean(videoFile)

    const contentErr = validateStoryContent({
      title,
      description: finalDescription,
      year,
      categoryId,
      riskLevel,
      photoCount: photoFiles.length,
      hasVideo,
      hasText,
      permissionConfirmed,
    })
    if (contentErr) {
      setError(contentErr)
      return
    }

    const creatingNewPin = !selectedPinId
    if (creatingNewPin && !newPinTitle.trim()) {
      setError('Enter a pin title or select an existing pin.')
      return
    }
    if (creatingNewPin && selectedArea) {
      if (selectedArea.map_type === 'geo' && (pinPlacement?.lat == null || pinPlacement?.lng == null)) {
        setError('Place the pin on the geo map.')
        return
      }
      if (selectedArea.map_type === 'image' && (pinPlacement?.x == null || pinPlacement?.y == null)) {
        setError('Place the pin on the school map.')
        return
      }
    }

    if (hasVideo && photoFiles.length > 0 && videoFile && photoFiles.length + 1 > MM_MAX_PHOTOS_PER_STORY + MM_MAX_VIDEOS_PER_STORY) {
      setError('Too many media files for this story.')
      return
    }

    setSubmitting(true)
    setUploadProgress('Preparing upload…')
    try {
      const mediaPayloads = await uploadMediaWithProgress()

      const storyType = inferStoryType(hasVideo, hasPhoto, hasText)
      const { error: submitErr } = await submitMemoryStory(supabase, {
        memoryMapId: map.id,
        areaId: selectedArea!.id,
        existingPinId: selectedPinId,
        pinTitle: creatingNewPin ? newPinTitle.trim() : undefined,
        pinCategoryId: categoryId,
        pinLat: pinPlacement?.lat ?? null,
        pinLng: pinPlacement?.lng ?? null,
        pinX: pinPlacement?.x ?? null,
        pinY: pinPlacement?.y ?? null,
        title: title.trim(),
        description: finalDescription,
        storyType,
        eventYear,
        uploadMode: locationMode,
        riskLevel,
        loggedByDisplayName: displayName.trim() || undefined,
        hasPermissionConfirmed: permissionConfirmed,
        tags,
        media: mediaPayloads,
      })

      if (submitErr) throw new Error(submitErr)
      setUploadProgress('')
      void trackMemoryMapEvent(supabase, {
        memoryMapId: map.id,
        eventType: 'story_submitted',
        areaId: selectedArea!.id,
      })
      setStep('done')
    } catch (e) {
      setUploadProgress('')
      setError(e instanceof Error ? e.message : 'Could not submit story.')
    } finally {
      setSubmitting(false)
    }
  }

  const mapMode = selectedArea?.map_type === 'image' ? 'image' : 'geo'

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />

      <div className="mx-auto max-w-lg px-4 py-6">
        <WizardProgress step={step} />
        {error ? <p className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
        {failedFileName ? (
          <p className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Failed: {failedFileName}. Remove the file or retry submit.
          </p>
        ) : null}
        {mediaWarning ? <p className="mb-4 text-sm text-amber-200">{mediaWarning}</p> : null}
        {uploadProgress ? <p className="mb-4 text-sm text-[var(--mm-accent)]">{uploadProgress}</p> : null}

        {step === 'access' ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-black">Add a memory</h1>
            {accessLoading ? (
              <p className="mm-muted text-sm">Checking access…</p>
            ) : !access?.isLoggedIn ? (
              <>
                <p className="mm-muted text-sm">Sign in to request contributor access and submit memories.</p>
                <Link href={buildLoginHref(returnPath)} className="mm-btn-primary block rounded-2xl px-4 py-3 text-center text-sm font-black">
                  Sign in
                </Link>
              </>
            ) : access.canSubmit || access.isMapAdmin ? (
              <button
                type="button"
                onClick={() => {
                  void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'add_memory_started' })
                  next()
                }}
                className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black"
              >
                Continue
              </button>
            ) : access.member?.status === 'pending' || requestSent ? (
              <MmEmptyState title="Your access request is pending" description="A school admin will review your contributor request soon." icon="⏳" />
            ) : access.member?.status === 'rejected' || access.member?.status === 'suspended' ? (
              <MmEmptyState title="You are not approved to contribute yet" description="Contact your school admin if you believe this is an error." icon="🔒" />
            ) : (
              <>
                <p className="mm-muted text-sm">Request contributor access for this Memory Map.</p>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Relationship (e.g. old boy, parent)" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                <textarea value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Why would you like to contribute?" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                <button type="button" onClick={() => void onRequestAccess()} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
                  Request access
                </button>
              </>
            )}
          </section>
        ) : null}

        {step === 'location' ? (
          <section className="space-y-4">
            <h2 className="text-xl font-black">Where did this happen?</h2>
            <select value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm">
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {(
              [
                ['current_location', 'Use my current location', 'We will use GPS to suggest the closest area.'],
                ['manual_geo', 'Place manually on Geo Map', 'Tap the map to set latitude and longitude.'],
                ['manual_image_map', 'Place on School / Indoor Map', 'Choose an area with a floor plan and tap to place.'],
                ['archive_submission', 'Archive memory — I know where it happened', 'Submit from home; encourage manual pin placement.'],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setLocationMode(value)
                  setUseExistingPinOnly(false)
                  if (value === 'current_location') requestGeo()
                }}
                className={`mm-card block w-full rounded-2xl p-4 text-left ${
                  locationMode === value ? 'ring-2 ring-[var(--mm-accent)]' : ''
                }`}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="mm-muted mt-1 text-xs">{hint}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setUseExistingPinOnly(true)
                setLocationMode('archive_submission')
              }}
              className={`mm-card block w-full rounded-2xl p-4 text-left ${useExistingPinOnly ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
            >
              <p className="text-sm font-semibold">Add to existing pin</p>
              <p className="mm-muted mt-1 text-xs">Search approved pins and attach your story.</p>
            </button>
            {geoMessage ? <p className="text-xs text-[var(--mm-accent)]">{geoMessage}</p> : null}
            <button type="button" onClick={next} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
              Continue
            </button>
          </section>
        ) : null}

        {step === 'pin' ? (
          <section className="space-y-4">
            <h2 className="text-xl font-black">{useExistingPinOnly ? 'Select existing pin' : 'Choose or create a pin'}</h2>
            <input
              value={pinSearch}
              onChange={(e) => setPinSearch(e.target.value)}
              placeholder="Search pins…"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {nearbyPins.map((pin: MemoryPin) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => {
                    setSelectedPinId(pin.id)
                    setNewPinTitle('')
                    setPinPlacement(null)
                  }}
                  className={`mm-card w-full rounded-2xl p-3 text-left ${selectedPinId === pin.id ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
                >
                  <p className="font-bold">{pin.title}</p>
                </button>
              ))}
            </div>
            {!useExistingPinOnly ? (
            <input
              value={newPinTitle}
              onChange={(e) => {
                setNewPinTitle(e.target.value)
                if (e.target.value) setSelectedPinId(null)
              }}
              placeholder="Or create new pin title"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
            />
            ) : null}
            {!selectedPinId && newPinTitle.trim() && selectedArea && !useExistingPinOnly ? (
              <>
                <button type="button" onClick={() => setPlacingPin((p) => !p)} className="mm-btn-secondary w-full rounded-xl px-3 py-2 text-sm font-bold">
                  {placingPin ? 'Done placing' : 'Place pin on map'}
                </button>
                {selectedArea && (
                  <MapCanvas
                    area={selectedArea}
                    pins={[]}
                    mode={mapMode}
                    onPinClick={() => {}}
                    placementMode={placingPin}
                    placementPreview={pinPlacement}
                    onMapClick={(p) => setPinPlacement(p)}
                  />
                )}
              </>
            ) : null}
            <div className="mm-card rounded-xl p-3 text-sm">
              {selectedPinId ? (
                <p>Your story will be added to: <strong>{pins.find((p) => p.id === selectedPinId)?.title}</strong></p>
              ) : newPinTitle.trim() ? (
                <p>A new pin will be created at this location: <strong>{newPinTitle}</strong></p>
              ) : (
                <p className="mm-muted">Select a pin or create a new one to continue.</p>
              )}
            </div>
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
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
              <button
                type="button"
                onClick={() => {
                  const t = tagInput.trim().toLowerCase()
                  if (t && !tags.includes(t)) setTags([...tags, t])
                  setTagInput('')
                }}
                className="mm-btn-secondary rounded-xl px-3 text-xs font-bold"
              >
                Add
              </button>
            </div>
            {tags.length > 0 ? <p className="text-xs text-white/60">{tags.map((t) => `#${t}`).join(' ')}</p> : null}
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
          <section className="space-y-4">
            <h2 className="text-xl font-black">Add content</h2>
            <p className="mm-muted text-xs">At least one of video, photo, or written description is required. Video max 250 MB; photos max 8 MB each.</p>

            <div className="mm-card rounded-2xl p-4">
              <p className="text-sm font-bold">Written story</p>
              <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Additional text" rows={4} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
            </div>

            <div className="mm-card rounded-2xl border-dashed p-4">
              <p className="text-sm font-bold">Photos (max {MM_MAX_PHOTOS_PER_STORY})</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="mt-2 w-full text-xs"
                onChange={(e) => {
                  addPhotoFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
              {photoFiles.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {photoFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => setPhotoFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-300">Remove</button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="mm-card rounded-2xl border-dashed p-4">
              <p className="text-sm font-bold">Video (max {MM_MAX_VIDEOS_PER_STORY})</p>
              <p className="mm-muted text-xs">Recommended under 3 minutes for faster review.</p>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="mt-2 w-full text-xs"
                onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
              />
              {videoFile ? (
                <div className="mt-2 flex justify-between text-xs">
                  <span className="truncate">{videoFile.name}</span>
                  <button type="button" onClick={() => setVideoFile(null)} className="text-red-300">Remove</button>
                </div>
              ) : null}
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
              <p><span className="mm-muted">Pin:</span> {selectedPinId ? pins.find((p) => p.id === selectedPinId)?.title : newPinTitle || '—'}</p>
            </div>
            <button
              type="button"
              disabled={submitting || !permissionConfirmed || !title || !description}
              onClick={() => void onSubmit()}
              className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for approval'}
            </button>
          </section>
        ) : null}

        {step === 'done' ? (
          <section className="space-y-4 text-center">
            <h2 className="text-2xl font-black">Submitted</h2>
            <p className="mm-muted text-sm">Your memory has been submitted for school admin approval.</p>
            <Link href={`/memory-map/${map.slug}/map`} className="mm-btn-primary block rounded-2xl px-4 py-3 text-sm font-black">
              Back to Memory Map
            </Link>
            <Link href={`/memory-map/${map.slug}/add`} className="mm-btn-secondary block rounded-2xl px-4 py-3 text-sm font-bold">
              Add another memory
            </Link>
          </section>
        ) : null}
      </div>
    </div>
  )
}
