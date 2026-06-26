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
  activeAreas,
  canProceedFromPinChoice,
  findNearestGeoArea,
  getNearbyPins,
  locationMethodUserLabel,
  resolveUploadMode,
} from '@/lib/memory-map/add-story-placement'
import {
  getAreaDefaultCenter,
  getImageMapInitialFocus,
  getMapInitialView,
  isFarFromArea,
} from '@/lib/memory-map/map-starting-point'
import {
  CONTRIBUTOR_GOVERNANCE_CHECKBOXES,
  REVIEW_LEVEL_OPTIONS,
} from '@/lib/memory-map/review-level'
import {
  MM_MAX_PHOTOS_PER_STORY,
  MM_MAX_VIDEOS_PER_STORY,
  validateImageFile,
  validateStoryContent,
  validateVideoFile,
} from '@/lib/memory-map/validation'
import type { MemoryArea, MemoryMapBundle, MemoryPin, RiskLevel, StoryType, UploadMode, MapPlacement } from '@/lib/memory-map/types'
import { areaMapTypeLabel } from '@/lib/memory-map/utils'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import MapCanvas from '@/components/memory-map/MapCanvas'
import MmEmptyState from '@/components/memory-map/MmEmptyState'

type Props = {
  bundle: MemoryMapBundle
  initialPinId?: string | null
}

type MainStep = 'place' | 'story' | 'media' | 'review' | 'done'
type PlaceSubstep = 'choice' | 'gps-loading' | 'gps-result' | 'area-select' | 'map-tap' | 'pin-choice' | 'summary'
type PlaceMethod = 'current' | 'manual'

const MAIN_STEPS: MainStep[] = ['place', 'story', 'media', 'review']
const MAIN_LABELS: Record<MainStep, string> = {
  place: 'Place',
  story: 'Story',
  media: 'Media',
  review: 'Review',
  done: 'Done',
}

function inferStoryType(hasVideo: boolean, hasPhoto: boolean, hasText: boolean): StoryType {
  if (hasVideo && (hasPhoto || hasText)) return 'mixed'
  if (hasVideo) return 'video'
  if (hasPhoto && hasText) return 'mixed'
  if (hasPhoto) return 'photo'
  return 'text'
}

function WizardProgress({ step }: { step: MainStep }) {
  if (step === 'done') return null
  const idx = MAIN_STEPS.indexOf(step)
  return (
    <div className="mb-5">
      <div className="flex gap-1.5">
        {MAIN_STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= idx ? 'bg-[var(--mm-accent)]' : 'bg-white/10'}`} />
            <p className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${i === idx ? 'text-white' : 'mm-muted'}`}>
              {MAIN_LABELS[s]}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function WizardFooter({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  showBack = true,
  showContinue = true,
}: {
  onBack?: () => void
  onContinue?: () => void
  continueLabel?: string
  continueDisabled?: boolean
  showBack?: boolean
  showContinue?: boolean
}) {
  if (!showBack && !showContinue) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[var(--mm-bg,#05080d)] px-4 py-3 mm-safe-bottom">
      <div className="mx-auto flex max-w-lg gap-3">
        {showBack && onBack ? (
          <button type="button" onClick={onBack} className="mm-btn-secondary min-h-[48px] flex-1 rounded-2xl px-4 text-sm font-bold">
            Back
          </button>
        ) : null}
        {showContinue && onContinue ? (
          <button
            type="button"
            disabled={continueDisabled}
            onClick={onContinue}
            className="mm-btn-primary min-h-[48px] flex-[2] rounded-2xl px-4 text-sm font-black disabled:opacity-50"
          >
            {continueLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function AddStoryWizard({ bundle, initialPinId }: Props) {
  const { map, areas, categories, pins } = bundle
  const mapAreas = useMemo(() => activeAreas(areas), [areas])

  const [access, setAccess] = useState<ContributorAccess | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)
  const [started, setStarted] = useState(false)

  const [step, setStep] = useState<MainStep>('place')
  const [placeSubstep, setPlaceSubstep] = useState<PlaceSubstep>('choice')
  const [placeMethod, setPlaceMethod] = useState<PlaceMethod | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [relationship, setRelationship] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const [locationMode, setLocationMode] = useState<UploadMode>('manual_geo')
  const [selectedAreaId, setSelectedAreaId] = useState(mapAreas[0]?.id ?? '')
  const [selectedPinId, setSelectedPinId] = useState<string | null>(initialPinId ?? null)
  const [newPinTitle, setNewPinTitle] = useState('')
  const [pinPlacement, setPinPlacement] = useState<MapPlacement | null>(null)
  const [isArchiveMemory, setIsArchiveMemory] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoFarWarning, setGeoFarWarning] = useState<string | null>(null)

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
  const [containsMinors, setContainsMinors] = useState(false)
  const [mentionsFullNames, setMentionsFullNames] = useState(false)
  const [showsInjury, setShowsInjury] = useState(false)
  const [archiveContent, setArchiveContent] = useState(false)
  const [sponsorBrandVisible, setSponsorBrandVisible] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [peopleInvolved, setPeopleInvolved] = useState('')
  const [groupClassYear, setGroupClassYear] = useState('')
  const [uploadProgress, setUploadProgress] = useState('')
  const [mediaWarning, setMediaWarning] = useState('')
  const [failedFileName, setFailedFileName] = useState<string | null>(null)

  useEffect(() => {
    if (isArchiveMemory || locationMode === 'archive_submission') {
      setArchiveContent(true)
    }
  }, [isArchiveMemory, locationMode])

  const governanceValues = {
    containsMinors,
    mentionsFullNames,
    showsInjury,
    isArchiveContent: archiveContent,
    sponsorOrBrandVisible: sponsorBrandVisible,
    hasPermissionConfirmed: permissionConfirmed,
  }

  function setGovernanceFlag(key: keyof typeof governanceValues, value: boolean) {
    switch (key) {
      case 'containsMinors':
        setContainsMinors(value)
        break
      case 'mentionsFullNames':
        setMentionsFullNames(value)
        break
      case 'showsInjury':
        setShowsInjury(value)
        break
      case 'isArchiveContent':
        setArchiveContent(value)
        break
      case 'sponsorOrBrandVisible':
        setSponsorBrandVisible(value)
        break
      case 'hasPermissionConfirmed':
        setPermissionConfirmed(value)
        break
    }
  }

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

  useEffect(() => {
    if (initialPinId) {
      const pin = pins.find((p) => p.id === initialPinId)
      if (pin) {
        setSelectedPinId(pin.id)
        setSelectedAreaId(pin.area_id)
        setPlaceSubstep('summary')
        const area = mapAreas.find((a) => a.id === pin.area_id)
        if (area) {
          setLocationMode(area.map_type === 'image' ? 'manual_image_map' : 'manual_geo')
        }
        if (pin.lat != null && pin.lng != null) {
          setPinPlacement({ lat: pin.lat, lng: pin.lng })
        } else if (pin.x_position != null && pin.y_position != null) {
          setPinPlacement({ x: pin.x_position, y: pin.y_position })
        }
      }
    }
  }, [initialPinId, pins, mapAreas])

  useEffect(() => {
    if (accessLoading || started) return
    const canContribute = access?.canSubmit || access?.isMapAdmin
    if (canContribute) {
      setStarted(true)
      void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'add_memory_started' })
    }
  }, [accessLoading, access, started, map.id])

  const selectedArea = mapAreas.find((a) => a.id === selectedAreaId) ?? mapAreas[0]
  const nearbyPins = useMemo(
    () => getNearbyPins(pins, selectedArea?.id ?? '', pinPlacement),
    [pins, selectedArea?.id, pinPlacement]
  )
  const mapMode = selectedArea?.map_type === 'image' ? 'image' : 'geo'
  const locateTarget =
    pinPlacement?.lat != null && pinPlacement?.lng != null
      ? { lat: pinPlacement.lat, lng: pinPlacement.lng }
      : null

  const areaInitialView = useMemo(() => {
    if (!selectedArea) return null
    return getMapInitialView({ area: selectedArea, memoryMap: map, pins })
  }, [selectedArea, map, pins])

  const areaImageFocus = useMemo(() => {
    if (!selectedArea) return null
    return getImageMapInitialFocus(selectedArea)
  }, [selectedArea])

  const hasStoryDraft = Boolean(
    title.trim() || description.trim() || textBody.trim() || photoFiles.length || videoFile || tags.length
  )

  function syncUploadMode(method: PlaceMethod | null, area: MemoryArea | undefined, archive: boolean) {
    if (!method || !area) return
    setLocationMode(resolveUploadMode(method, area, archive))
  }

  function fallbackToManualStartPoint(message: string, area?: typeof selectedArea) {
    const targetArea = area ?? mapAreas[0]
    if (!targetArea) {
      setGeoError(message)
      setPlaceSubstep('choice')
      return
    }
    setPlaceMethod('manual')
    setSelectedAreaId(targetArea.id)
    const centre = getAreaDefaultCenter(targetArea, map)
    if (centre && targetArea.map_type === 'geo') {
      setPinPlacement({ lat: centre.lat, lng: centre.lng })
    }
    setGeoError(message)
    setPlaceSubstep('map-tap')
  }

  function startCurrentLocation() {
    setPlaceMethod('current')
    setIsArchiveMemory(false)
    setGeoError(null)
    setGeoFarWarning(null)
    setSelectedPinId(null)
    setNewPinTitle('')
    setPinPlacement(null)
    setPlaceSubstep('gps-loading')

    if (!navigator.geolocation) {
      fallbackToManualStartPoint(
        "We could not access your current location. We've opened the school's map starting point so you can place the pin manually."
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const nearest = findNearestGeoArea(mapAreas, lat, lng)
        if (!nearest) {
          fallbackToManualStartPoint(
            'This Memory Map does not have any areas yet. Ask the school admin to add an area first.'
          )
          return
        }
        setPinPlacement({ lat, lng })
        setSelectedAreaId(nearest.id)
        setLocationMode('current_location')
        if (isFarFromArea(lat, lng, nearest, map)) {
          setGeoFarWarning('You seem to be away from this location. You can still place the memory manually.')
        }
        setPlaceSubstep('gps-result')
      },
      () => {
        fallbackToManualStartPoint(
          "We could not access your current location. We've opened the school's map starting point so you can place the pin manually."
        )
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function startManualPlacement() {
    setPlaceMethod('manual')
    setGeoError(null)
    setSelectedPinId(null)
    setNewPinTitle('')
    setPinPlacement(null)
    if (mapAreas.length === 0) {
      setPlaceSubstep('area-select')
      return
    }
    setPlaceSubstep('area-select')
  }

  function selectArea(areaId: string) {
    const area = mapAreas.find((a) => a.id === areaId)
    if (!area) return
    setSelectedAreaId(areaId)
    setSelectedPinId(null)
    setNewPinTitle('')
    setPinPlacement(null)
    syncUploadMode('manual', area, isArchiveMemory)
    setPlaceSubstep('map-tap')
  }

  function onMapTap(placement: MapPlacement) {
    setPinPlacement(placement)
    if (selectedArea && placeMethod === 'manual') {
      syncUploadMode('manual', selectedArea, isArchiveMemory)
    }
    setPlaceSubstep('pin-choice')
  }

  function onArchiveToggle(checked: boolean) {
    setIsArchiveMemory(checked)
    if (selectedArea && placeMethod === 'manual') {
      syncUploadMode('manual', selectedArea, checked)
    }
  }

  function confirmChangeLocation(next: () => void) {
    if (
      hasStoryDraft &&
      !window.confirm('Changing the location will keep your story details but may change the selected pin.')
    ) {
      return
    }
    next()
  }

  function resetPlaceFlow() {
    setPlaceMethod(null)
    setPlaceSubstep('choice')
    setSelectedPinId(null)
    setNewPinTitle('')
    setPinPlacement(null)
    setIsArchiveMemory(false)
    setGeoError(null)
  }

  function goToStoryStep() {
    if (!canProceedFromPinChoice(selectedPinId, newPinTitle, pinPlacement, selectedArea)) {
      setError('Select an existing pin or create a new one at your chosen location.')
      return
    }
    setError('')
    setStep('story')
  }

  function placeBack() {
    setError('')
    switch (placeSubstep) {
      case 'choice':
        break
      case 'gps-loading':
        setPlaceSubstep('choice')
        break
      case 'gps-result':
        setPlaceSubstep('choice')
        break
      case 'area-select':
        setPlaceSubstep('choice')
        break
      case 'map-tap':
        setPlaceSubstep('area-select')
        break
      case 'pin-choice':
        setPlaceSubstep(placeMethod === 'current' ? 'gps-result' : 'map-tap')
        break
      case 'summary':
        setPlaceSubstep('pin-choice')
        break
    }
  }

  function mainBack() {
    setError('')
    if (step === 'story') {
      setStep('place')
      setPlaceSubstep('summary')
      return
    }
    if (step === 'media') {
      setStep('story')
      return
    }
    if (step === 'review') {
      setStep('media')
    }
  }

  function mainContinue() {
    setError('')
    if (step === 'place' && placeSubstep === 'summary') {
      goToStoryStep()
      return
    }
    if (step === 'story') {
      if (!title.trim() || !description.trim() || !year) {
        setError('Add a title, year, and description to continue.')
        return
      }
      if (!permissionConfirmed) {
        setError('Confirm you have permission to submit this content.')
        return
      }
      setStep('media')
      return
    }
    if (step === 'media') {
      const hasText = Boolean(textBody.trim() || description.trim())
      const hasPhoto = photoFiles.length > 0
      const hasVideo = Boolean(videoFile)
      if (!hasText && !hasPhoto && !hasVideo) {
        setError('Add at least one of video, photo, or written content.')
        return
      }
      setStep('review')
    }
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
    const result = validateVideoFile(file)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.warning) setMediaWarning(result.warning)
    setVideoFile(file)
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
        thumbnail_url: kind === 'image' ? up.file_url : null,
      })
    }
    return payloads
  }

  async function onSubmit() {
    setError('')
    setFailedFileName(null)
    const eventYear = parseInt(year, 10)
    const contextLines = [
      peopleInvolved.trim() ? `Who was involved: ${peopleInvolved.trim()}` : '',
      groupClassYear.trim() ? `Team/group/class/year: ${groupClassYear.trim()}` : '',
    ].filter(Boolean)
    const finalDescription = [description.trim(), textBody.trim(), ...contextLines].filter(Boolean).join('\n\n')
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
        setError('Place the pin on the map.')
        return
      }
      if (selectedArea.map_type === 'image' && (pinPlacement?.x == null || pinPlacement?.y == null)) {
        setError('Tap the school map where this memory happened.')
        return
      }
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
        containsMinors,
        mentionsFullNames,
        showsInjury,
        isArchiveContent: archiveContent,
        sponsorOrBrandVisible: sponsorBrandVisible,
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

  const canContribute = access?.canSubmit || access?.isMapAdmin
  const showWizardFooter =
    canContribute &&
    step !== 'done' &&
    !(step === 'place' && (placeSubstep === 'choice' || placeSubstep === 'gps-loading'))

  const footerBack = step === 'place' ? placeBack : mainBack
  const footerContinue =
    step === 'review'
      ? undefined
      : step === 'place' && (placeSubstep === 'pin-choice' || placeSubstep === 'gps-result')
        ? () => setPlaceSubstep('summary')
        : mainContinue
  const footerContinueLabel =
    step === 'place' && (placeSubstep === 'summary' || placeSubstep === 'pin-choice' || placeSubstep === 'gps-result')
      ? placeSubstep === 'summary'
        ? 'Continue'
        : 'Review location'
      : step === 'media'
        ? 'Review'
        : 'Continue'
  const footerContinueDisabled =
    step === 'place' &&
    (placeSubstep === 'pin-choice' || placeSubstep === 'gps-result') &&
    !canProceedFromPinChoice(selectedPinId, newPinTitle, pinPlacement, selectedArea)

  return (
    <div style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />

      <div className={`mx-auto max-w-lg px-4 py-6 ${showWizardFooter ? 'pb-28' : 'mm-safe-bottom'}`}>
        {accessLoading ? (
          <p className="mm-muted text-sm">Checking access…</p>
        ) : !access?.isLoggedIn ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-black">Add a memory</h1>
            <p className="mm-muted text-sm">Sign in to request contributor access and submit memories.</p>
            <Link href={buildLoginHref(returnPath)} className="mm-btn-primary block rounded-2xl px-4 py-3 text-center text-sm font-black">
              Sign in
            </Link>
          </section>
        ) : !canContribute ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-black">Add a memory</h1>
            {access.member?.status === 'pending' || requestSent ? (
              <MmEmptyState
                title="Your contributor request is waiting for school admin approval"
                description="We will notify you once a school admin approves your access."
                icon="⏳"
              />
            ) : access.member?.status === 'rejected' || access.member?.status === 'suspended' ? (
              <MmEmptyState
                title="Your contributor request was not approved"
                description="Contact the school admin if this seems incorrect."
                icon="🔒"
              />
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
        ) : (
          <>
            <WizardProgress step={step} />
            {error ? <p className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            {failedFileName ? (
              <p className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Failed: {failedFileName}. Remove the file or retry submit.
              </p>
            ) : null}
            {mediaWarning ? <p className="mb-4 text-sm text-amber-200">{mediaWarning}</p> : null}
            {uploadProgress ? <p className="mb-4 text-sm text-[var(--mm-accent)]">{uploadProgress}</p> : null}

            {step === 'place' && placeSubstep === 'choice' ? (
              <section className="space-y-4">
                <div>
                  <h1 className="text-2xl font-black">Where did this happen?</h1>
                  <p className="mm-muted mt-2 text-sm">Start with your location or place the memory manually.</p>
                </div>
                {geoError ? (
                  <div className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-3">
                    <p className="text-sm text-amber-100">{geoError}</p>
                    <button type="button" onClick={startManualPlacement} className="mm-btn-secondary w-full rounded-xl px-3 py-2 text-sm font-bold">
                      Place pin manually instead
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={startCurrentLocation}
                  className="mm-card w-full rounded-2xl border-2 border-[var(--mm-accent)] p-5 text-left ring-1 ring-[var(--mm-accent)]/30"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden>📍</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-black">Use my current location</p>
                      <p className="mm-muted mt-1 text-sm">Best if you are standing where it happened.</p>
                      <span className="mm-btn-primary mt-4 inline-block rounded-xl px-4 py-2 text-xs font-black">Find my location</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={startManualPlacement}
                  className="mm-card w-full rounded-2xl p-5 text-left"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden>🗺️</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-black">Place pin manually</p>
                      <p className="mm-muted mt-1 text-sm">Best for old memories, indoor spaces, or if you are not there.</p>
                      <span className="mm-btn-secondary mt-4 inline-block rounded-xl px-4 py-2 text-xs font-bold">Choose on map</span>
                    </div>
                  </div>
                </button>
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'gps-loading' ? (
              <section className="space-y-4 text-center">
                <h2 className="text-xl font-black">Finding your location…</h2>
                <p className="mm-muted text-sm">Please allow location access in your browser.</p>
                <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-[var(--mm-accent)]/30" />
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'gps-result' && selectedArea ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black">You are near {selectedArea.name}</h2>
                  <p className="mm-muted mt-1 text-sm">Tap the map to adjust, or choose a nearby pin below.</p>
                </div>
                {geoFarWarning ? (
                  <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{geoFarWarning}</p>
                ) : null}
                <div className="-mx-4">
                  <MapCanvas
                    area={selectedArea}
                    pins={nearbyPins.length ? nearbyPins : pins.filter((p) => p.area_id === selectedArea.id && p.status === 'approved')}
                    mode="geo"
                    onPinClick={(pin) => {
                      setSelectedPinId(pin.id)
                      setNewPinTitle('')
                    }}
                    placementMode
                    placementPreview={pinPlacement}
                    onMapClick={(p) => {
                      setPinPlacement(p)
                      setSelectedPinId(null)
                      setNewPinTitle('')
                    }}
                    locateTarget={locateTarget}
                    initialView={areaInitialView}
                  />
                </div>
                <PinChoiceSection
                  nearbyPins={nearbyPins}
                  allAreaPins={pins.filter((p) => p.area_id === selectedArea.id && p.status === 'approved')}
                  selectedPinId={selectedPinId}
                  newPinTitle={newPinTitle}
                  onSelectPin={(id) => {
                    setSelectedPinId(id)
                    setNewPinTitle('')
                  }}
                  onNewPinTitle={setNewPinTitle}
                  onCreateNew={() => {
                    setSelectedPinId(null)
                  }}
                />
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'area-select' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black">Choose the area</h2>
                  <p className="mm-muted mt-1 text-sm">Adding an old memory? You can place it manually even if you are not at the school.</p>
                </div>
                {mapAreas.length === 0 ? (
                  <MmEmptyState
                    title="No areas yet"
                    description="This Memory Map does not have any areas yet. Ask the school admin to add an area first."
                    icon="🗺️"
                  />
                ) : (
                  <div className="space-y-3">
                    {mapAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => selectArea(area.id)}
                        className="mm-card w-full rounded-2xl p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">{area.name}</p>
                            <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              {areaMapTypeLabel(area)}
                            </span>
                          </div>
                          <p className="mm-muted shrink-0 text-xs">
                            {(area.pin_count ?? 0) > 0 ? `${area.pin_count} pins` : ''}
                            {(area.pin_count ?? 0) > 0 && (area.story_count ?? 0) > 0 ? ' · ' : ''}
                            {(area.story_count ?? 0) > 0 ? `${area.story_count} stories` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'map-tap' && selectedArea ? (
              <section className="space-y-4">
                <div>
                  <h2 className="text-xl font-black">{selectedArea.name}</h2>
                  <p className="mm-muted mt-1 text-sm">
                    {selectedArea.map_type === 'image'
                      ? 'Tap the school map where this memory happened.'
                      : 'Tap the map where this memory happened.'}
                  </p>
                </div>
                {geoError ? (
                  <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{geoError}</p>
                ) : null}
                {selectedArea.map_type === 'image' && !selectedArea.map_image_url ? (
                  <MmEmptyState
                    title="No school map uploaded"
                    description="This area does not have a school map uploaded yet. Choose another area or use the geo map."
                    icon="🖼️"
                  />
                ) : (
                  <div className="-mx-4">
                    <MapCanvas
                      area={selectedArea}
                      pins={pins.filter((p) => p.area_id === selectedArea.id && p.status === 'approved')}
                      mode={mapMode}
                      onPinClick={() => {}}
                      placementMode
                      placementPreview={pinPlacement}
                      onMapClick={onMapTap}
                      locateTarget={locateTarget}
                      initialView={areaInitialView}
                      imageFocus={areaImageFocus}
                    />
                  </div>
                )}
                <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={isArchiveMemory}
                    onChange={(e) => onArchiveToggle(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>This is an archive memory / I am not there now</span>
                </label>
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'pin-choice' && selectedArea ? (
              <section className="space-y-4">
                <div className="mm-card rounded-2xl border border-[var(--mm-accent)]/40 p-3 text-sm">
                  <p className="font-semibold text-[var(--mm-accent)]">Location selected</p>
                  <p className="mm-muted mt-1 text-xs">{selectedArea.name} · {areaMapTypeLabel(selectedArea)}</p>
                </div>
                <div className="-mx-4">
                  <MapCanvas
                    area={selectedArea}
                    pins={nearbyPins}
                    mode={mapMode}
                    onPinClick={() => {}}
                    placementMode={false}
                    placementPreview={pinPlacement}
                    locateTarget={locateTarget}
                    initialView={areaInitialView}
                    imageFocus={areaImageFocus}
                  />
                </div>
                <PinChoiceSection
                  nearbyPins={nearbyPins}
                  allAreaPins={pins.filter((p) => p.area_id === selectedArea.id && p.status === 'approved')}
                  selectedPinId={selectedPinId}
                  newPinTitle={newPinTitle}
                  onSelectPin={(id) => {
                    setSelectedPinId(id)
                    setNewPinTitle('')
                  }}
                  onNewPinTitle={setNewPinTitle}
                  onCreateNew={() => setSelectedPinId(null)}
                />
              </section>
            ) : null}

            {step === 'place' && placeSubstep === 'summary' ? (
              <section className="space-y-4">
                <h2 className="text-xl font-black">Location summary</h2>
                <div className="mm-card space-y-3 rounded-2xl p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="mm-muted">Area</span>
                    <span className="text-right font-semibold">{selectedArea?.name ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="mm-muted">Map type</span>
                    <span className="text-right">{selectedArea ? areaMapTypeLabel(selectedArea) : '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="mm-muted">Pin</span>
                    <span className="text-right font-semibold">
                      {selectedPinId ? pins.find((p) => p.id === selectedPinId)?.title : newPinTitle.trim() || 'New pin'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="mm-muted">Method</span>
                    <span className="text-right">{locationMethodUserLabel(locationMode)}</span>
                  </div>
                </div>
                {selectedArea && pinPlacement ? (
                  <div className="-mx-4">
                    <MapCanvas
                      area={selectedArea}
                      pins={selectedPinId ? pins.filter((p) => p.id === selectedPinId) : []}
                      mode={mapMode}
                      onPinClick={() => {}}
                      placementPreview={pinPlacement}
                      locateTarget={locateTarget}
                      initialView={areaInitialView}
                      imageFocus={areaImageFocus}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => confirmChangeLocation(resetPlaceFlow)}
                  className="mm-btn-secondary w-full rounded-xl px-3 py-2 text-sm font-bold"
                >
                  Change location
                </button>
              </section>
            ) : null}

            {step === 'story' ? (
              <section className="space-y-3">
                <h2 className="text-xl font-black">Tell your story</h2>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Story title *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year happened *" type="number" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened here? *" rows={4} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
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
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold">Review level</span>
                    <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm">
                      {REVIEW_LEVEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mm-muted mt-2 text-xs leading-relaxed">
                      This helps the school admin know how carefully to review the memory before publishing.
                    </p>
                  </label>
                </div>
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs font-semibold text-white/90">Content notes (optional)</p>
                  {CONTRIBUTOR_GOVERNANCE_CHECKBOXES.map(({ key, label, required }) => (
                    <label key={key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={governanceValues[key]}
                        onChange={(e) => setGovernanceFlag(key, e.target.checked)}
                        className="mt-0.5"
                        required={required}
                      />
                      <span>{label}{required ? ' *' : ''}</span>
                    </label>
                  ))}
                </div>
                {(isArchiveMemory || placeMethod === 'manual') ? (
                  <>
                    <input value={peopleInvolved} onChange={(e) => setPeopleInvolved(e.target.value)} placeholder="Who was involved? (optional)" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                    <input value={groupClassYear} onChange={(e) => setGroupClassYear(e.target.value)} placeholder="Team / group / class / year (optional)" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
                  </>
                ) : null}
              </section>
            ) : null}

            {step === 'media' ? (
              <section className="space-y-4">
                <h2 className="text-xl font-black">Add photos, video or text</h2>
                <p className="mm-muted text-xs">Add at least one type of content. Video max 250 MB; photos max 8 MB each.</p>
                <div className="mm-card rounded-2xl p-4">
                  <p className="text-sm font-bold">Written story</p>
                  <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Additional text (optional)" rows={4} className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
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
              </section>
            ) : null}

            {step === 'review' ? (
              <section className="space-y-4">
                <h2 className="text-xl font-black">Review & submit</h2>
                <div className="mm-card space-y-2 rounded-2xl p-4 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">Location</p>
                  <p><span className="mm-muted">Area:</span> {selectedArea?.name ?? '—'}</p>
                  <p><span className="mm-muted">Pin:</span> {selectedPinId ? pins.find((p) => p.id === selectedPinId)?.title : newPinTitle || '—'}</p>
                  <p><span className="mm-muted">Method:</span> {locationMethodUserLabel(locationMode)}</p>
                </div>
                <div className="mm-card space-y-2 rounded-2xl p-4 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">Story</p>
                  <p><span className="mm-muted">Title:</span> {title || '—'}</p>
                  <p><span className="mm-muted">Year:</span> {year}</p>
                  <p><span className="mm-muted">Category:</span> {categories.find((c) => c.id === categoryId)?.name ?? '—'}</p>
                  {tags.length > 0 ? <p><span className="mm-muted">Tags:</span> {tags.map((t) => `#${t}`).join(' ')}</p> : null}
                </div>
                <div className="mm-card space-y-2 rounded-2xl p-4 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--mm-accent)]">Media</p>
                  <p>{photoFiles.length} photo(s){videoFile ? ', 1 video' : ''}{textBody.trim() ? ', written text' : ''}</p>
                </div>
                {!permissionConfirmed ? (
                  <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Go back to the Story step and confirm you have permission to submit this content.
                  </p>
                ) : null}
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
          </>
        )}
      </div>

      {showWizardFooter ? (
        <WizardFooter
          onBack={footerBack}
          onContinue={footerContinue}
          continueLabel={footerContinueLabel}
          continueDisabled={footerContinueDisabled}
          showBack={!(step === 'place' && placeSubstep === 'choice')}
          showContinue={step !== 'review'}
        />
      ) : null}
    </div>
  )
}

function PinChoiceSection({
  nearbyPins,
  allAreaPins,
  selectedPinId,
  newPinTitle,
  onSelectPin,
  onNewPinTitle,
  onCreateNew,
}: {
  nearbyPins: MemoryPin[]
  allAreaPins: MemoryPin[]
  selectedPinId: string | null
  newPinTitle: string
  onSelectPin: (id: string) => void
  onNewPinTitle: (title: string) => void
  onCreateNew: () => void
}) {
  const pinsToShow = nearbyPins.length > 0 ? nearbyPins : allAreaPins

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-black">Is this memory about one of these existing places?</h3>
        {nearbyPins.length === 0 ? (
          <p className="mm-muted mt-1 text-xs">No nearby pins found. You can create a new pin here.</p>
        ) : null}
      </div>
      {pinsToShow.length > 0 ? (
        <div className="max-h-44 space-y-2 overflow-y-auto">
          {pinsToShow.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={() => onSelectPin(pin.id)}
              className={`mm-card w-full rounded-xl p-3 text-left ${selectedPinId === pin.id ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
            >
              <p className="font-bold">{pin.title}</p>
              <p className="mm-muted text-xs">Add to this pin</p>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mm-card rounded-2xl p-4">
        <p className="text-sm font-black">Create a new pin here</p>
        <input
          value={newPinTitle}
          onChange={(e) => {
            onCreateNew()
            onNewPinTitle(e.target.value)
          }}
          placeholder="Pin name (e.g. Pavilion steps)"
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
        />
      </div>
    </div>
  )
}
