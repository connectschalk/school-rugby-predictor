'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildLoginHref } from '@/lib/auth-return-path'
import type { ContributorAccess } from '@/lib/memory-map/membership'
import { fetchContributorAccess } from '@/lib/memory-map/membership'
import { requestContributorAccess, submitMemoryStory, type StoryMediaPayload } from '@/lib/memory-map/mutations'
import { uploadPendingStoryMedia } from '@/lib/memory-map/storage'
import { trackMemoryMapEvent } from '@/lib/memory-map/analytics'
import { activeAreas } from '@/lib/memory-map/add-story-placement'
import { inferStoryType } from '@/lib/memory-map/infer-story-type'
import { getImageMapInitialFocus, getMapInitialView } from '@/lib/memory-map/map-starting-point'
import {
  deriveStoryTitle,
  getQuickMemoryFieldErrors,
  validateQuickMemorySubmit,
  validateImageFile,
  validateVideoFile,
  MM_MAX_PHOTOS_PER_STORY,
  type QuickMemoryFieldErrors,
} from '@/lib/memory-map/validation'
import {
  OPTIONAL_GOVERNANCE_CHECKBOXES,
  CONTRIBUTOR_REVIEW_NOTE_OPTIONS,
  type StoryGovernanceFlags,
} from '@/lib/memory-map/review-level'
import type { MapPlacement, MemoryMapBundle, MemoryPin, RiskLevel, UploadMode } from '@/lib/memory-map/types'
import { yearRangeForStories } from '@/lib/memory-map/utils'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import MemoryMapHeader from '@/components/memory-map/MemoryMapHeader'
import MapCanvas from '@/components/memory-map/MapCanvas'
import CategoryFilterPills from '@/components/memory-map/CategoryFilterPills'
import StoryCard from '@/components/memory-map/StoryCard'
import MemoryMapShell from '@/components/memory-map/MemoryMapShell'
import MmEmptyState from '@/components/memory-map/MmEmptyState'

type Props = {
  bundle: MemoryMapBundle
  initialPinId?: string | null
  initialAreaId?: string | null
}

type PinTarget =
  | { kind: 'existing'; pin: MemoryPin }
  | {
      kind: 'new'
      placement: MapPlacement
      title: string
      description: string
      categoryId: string
    }

type SheetStage = 'pin-existing' | 'pin-new' | 'content' | 'success'

const MONTHS = [
  { value: '', label: 'Month (optional)' },
  ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) => ({
    value: String(i + 1),
    label,
  })),
]

function defaultCategoryId(categories: MemoryMapBundle['categories']): string {
  return categories.find((c) => c.name.toLowerCase() === 'general')?.id ?? categories[0]?.id ?? ''
}

export default function AddStoryWizard({ bundle, initialPinId, initialAreaId }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const mapAreas = useMemo(() => activeAreas(areas), [areas])
  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories])

  const [access, setAccess] = useState<ContributorAccess | null>(null)
  const [accessLoading, setAccessLoading] = useState(true)
  const [relationship, setRelationship] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const [selectedAreaId, setSelectedAreaId] = useState(
    initialAreaId && mapAreas.some((a) => a.id === initialAreaId) ? initialAreaId : mapAreas[0]?.id ?? ''
  )
  const [showFilters, setShowFilters] = useState(false)
  const [pinSearch, setPinSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<PinTarget | null>(null)
  const [tempPlacement, setTempPlacement] = useState<MapPlacement | null>(null)
  const [sheetStage, setSheetStage] = useState<SheetStage | null>(null)
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [usedGps, setUsedGps] = useState(false)
  const [isArchiveMemory, setIsArchiveMemory] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState('')
  const [failedFileName, setFailedFileName] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState('')

  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategoryId(activeCategories))
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('low')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [textBody, setTextBody] = useState('')
  const [peopleInvolved, setPeopleInvolved] = useState('')
  const [groupClassYear, setGroupClassYear] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [showTextEditor, setShowTextEditor] = useState(false)
  const [hasAutoDisplayName, setHasAutoDisplayName] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)
  const [containsMinors, setContainsMinors] = useState(false)
  const [mentionsFullNames, setMentionsFullNames] = useState(false)
  const [showsInjury, setShowsInjury] = useState(false)
  const [archiveContent, setArchiveContent] = useState(false)
  const [sponsorBrandVisible, setSponsorBrandVisible] = useState(false)

  const returnPath = `/memory-map/${map.slug}/add${initialAreaId ? `?area=${initialAreaId}` : ''}${initialPinId ? `${initialAreaId ? '&' : '?'}pin=${initialPinId}` : ''}`

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
    void supabase.auth.getUser().then(({ data }) => {
      const name =
        (data.user?.user_metadata?.display_name as string | undefined) ??
        (data.user?.user_metadata?.full_name as string | undefined) ??
        data.user?.email?.split('@')[0]
      if (name?.trim()) {
        setDisplayName(name.trim())
        setHasAutoDisplayName(true)
      }
    })
  }, [])

  const canContribute = access?.canSubmit || access?.isMapAdmin
  const hasCategories = activeCategories.length > 0

  useEffect(() => {
    if (!canContribute || accessLoading) return
    void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'add_memory_started' })
  }, [canContribute, accessLoading, map.id])

  const selectedArea = mapAreas.find((a) => a.id === selectedAreaId) ?? mapAreas[0]
  const mapMode = selectedArea?.map_type === 'image' ? 'image' : 'geo'

  const areaInitialView = useMemo(() => {
    if (!selectedArea) return null
    return getMapInitialView({ area: selectedArea, memoryMap: map, pins })
  }, [selectedArea, map, pins])

  const areaImageFocus = useMemo(() => {
    if (!selectedArea) return null
    return getImageMapInitialFocus(selectedArea)
  }, [selectedArea])

  const areaPins = useMemo(() => {
    const q = pinSearch.trim().toLowerCase()
    return pins
      .filter((p) => p.area_id === selectedArea?.id && p.status === 'approved')
      .filter((p) => (categoryFilter ? p.category_id === categoryFilter : true))
      .filter((p) => (q ? p.title.toLowerCase().includes(q) : true))
  }, [pins, selectedArea?.id, categoryFilter, pinSearch])

  const placementPreview = useMemo(() => {
    if (pinTarget?.kind === 'new') return pinTarget.placement
    if (tempPlacement) return tempPlacement
    return null
  }, [pinTarget, tempPlacement])

  const governanceValues: StoryGovernanceFlags = {
    containsMinors,
    mentionsFullNames,
    showsInjury,
    isArchiveContent: archiveContent,
    sponsorOrBrandVisible: sponsorBrandVisible,
    hasPermissionConfirmed: permissionConfirmed,
  }

  function setGovernanceFlag(key: keyof StoryGovernanceFlags, value: boolean) {
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

  function resolveUploadMode(): UploadMode {
    if (isArchiveMemory || archiveContent) return 'archive_submission'
    if (usedGps) return 'current_location'
    return selectedArea?.map_type === 'image' ? 'manual_image_map' : 'manual_geo'
  }

  function clearPinSelection() {
    setPinTarget(null)
    setTempPlacement(null)
    setSheetStage(null)
    setError('')
  }

  function resetStoryFields() {
    setYear(String(new Date().getFullYear()))
    setMonth('')
    setEventDate('')
    setDescription('')
    setTextBody('')
    setPhotoFiles([])
    setVideoFile(null)
    setTags([])
    setTagInput('')
    setPeopleInvolved('')
    setGroupClassYear('')
    setRiskLevel('low')
    setPermissionConfirmed(false)
    setContainsMinors(false)
    setMentionsFullNames(false)
    setShowsInjury(false)
    setArchiveContent(false)
    setSponsorBrandVisible(false)
    setIsArchiveMemory(false)
    setShowMoreDetails(false)
    setShowTextEditor(false)
    setSubmitAttempted(false)
    setError('')
    setFailedFileName(null)
    setUploadProgress('')
  }

  function selectArea(areaId: string) {
    setSelectedAreaId(areaId)
    clearPinSelection()
    setLocateTarget(null)
    setGeoMessage(null)
    setUsedGps(false)
  }

  function openExistingPin(pin: MemoryPin) {
    setTempPlacement(null)
    setPinTarget({ kind: 'existing', pin })
    setCategoryId(pin.category_id ?? activeCategories[0]?.id ?? '')
    resetStoryFields()
    setSheetStage('pin-existing')
  }

  function onMapClick(placement: MapPlacement) {
    setTempPlacement(placement)
    if (pinTarget?.kind === 'new') {
      setPinTarget({ ...pinTarget, placement })
      return
    }
    setPinTarget({
      kind: 'new',
      placement,
      title: '',
      description: '',
      categoryId: defaultCategoryId(activeCategories),
    })
    setSheetStage('pin-new')
  }

  function onPinClick(pin: MemoryPin) {
    openExistingPin(pin)
  }

  function onUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoMessage('We could not access your location. Tap the map to place the pin manually.')
      return
    }
    setGeoMessage('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setLocateTarget({ lat, lng })
        setUsedGps(true)
        setTempPlacement({ lat, lng })
        setPinTarget({
          kind: 'new',
          placement: { lat, lng },
          title: '',
          description: '',
          categoryId: defaultCategoryId(activeCategories),
        })
        setSheetStage('pin-new')
        setGeoMessage('Location found. Add your memory here or move the pin.')
      },
      () => setGeoMessage('We could not access your location. Tap the map to place the pin manually.'),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  function updateNewPin(fields: Partial<Extract<PinTarget, { kind: 'new' }>>) {
    if (pinTarget?.kind !== 'new') return
    setPinTarget({ ...pinTarget, ...fields })
  }

  function openStoryForm() {
    if (pinTarget?.kind === 'new' && !pinTarget.title.trim()) {
      setError('Name this place before adding your memory.')
      return
    }
    if (pinTarget?.kind === 'existing') {
      setCategoryId(pinTarget.pin.category_id ?? categoryId)
    } else if (pinTarget?.kind === 'new') {
      setCategoryId(pinTarget.categoryId)
    }
    setError('')
    setSheetStage('content')
  }

  function buildFinalDescription(): string {
    const parts = [description.trim()]
    if (peopleInvolved.trim()) parts.push(`People involved: ${peopleInvolved.trim()}`)
    if (groupClassYear.trim()) parts.push(`Team/group/class/year: ${groupClassYear.trim()}`)
    if (month && !eventDate) {
      const monthLabel = MONTHS.find((m) => m.value === month)?.label
      if (monthLabel) parts.push(`Month: ${monthLabel}`)
    }
    const main = parts.filter(Boolean).join('\n\n')
    return [main, textBody.trim()].filter(Boolean).join('\n\n')
  }

  function resolveEventDate(): string | null {
    if (eventDate) return eventDate
    if (month && year) {
      const m = month.padStart(2, '0')
      return `${year}-${m}-01`
    }
    return null
  }

  useEffect(() => {
    if (!canContribute || !initialPinId) return
    const pin = pins.find((p) => p.id === initialPinId && p.status === 'approved')
    if (pin) {
      setSelectedAreaId(pin.area_id)
      openExistingPin(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canContribute, initialPinId])

  useEffect(() => {
    if (!eventDate) return
    const y = eventDate.slice(0, 4)
    const m = eventDate.slice(5, 7)
    if (y && !Number.isNaN(parseInt(y, 10))) setYear(y)
    if (m) setMonth(String(parseInt(m, 10)))
  }, [eventDate])

  async function onRequestAccess() {
    setError('')
    const { error: err } = await requestContributorAccess(supabase, map.id, relationship, requestMessage)
    if (err) {
      setError(err)
      return
    }
    setRequestSent(true)
    void trackMemoryMapEvent(supabase, { memoryMapId: map.id, eventType: 'contributor_request_submitted' })
    await loadAccess()
  }

  function addPhotoFiles(files: File[]) {
    setError('')
    setFailedFileName(null)
    const next = [...photoFiles]
    for (const file of files) {
      if (next.length >= MM_MAX_PHOTOS_PER_STORY) break
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
    setFailedFileName(null)
    if (!file) {
      setVideoFile(null)
      return
    }
    const result = validateVideoFile(file)
    if (!result.ok) {
      setError(result.error)
      return
    }
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
        throw new Error("We couldn't upload that file. Try again or choose a smaller file.")
      }
      payloads.push({ ...up, thumbnail_url: kind === 'image' ? up.file_url : null })
    }
    return payloads
  }

  async function onSubmit() {
    if (!pinTarget || !selectedArea) return
    if (!hasCategories) {
      setError('The school admin needs to create a category before memories can be submitted.')
      return
    }
    setSubmitAttempted(true)
    setError('')
    setFailedFileName(null)
    const finalDescription = buildFinalDescription()
    const hasPhoto = photoFiles.length > 0
    const hasVideo = Boolean(videoFile)
    const creatingNewPin = pinTarget.kind === 'new'
    const placement = creatingNewPin ? pinTarget.placement : null
    const pinCategoryId = creatingNewPin ? pinTarget.categoryId : (pinTarget.pin.category_id ?? categoryId)

    const contentErr = validateQuickMemorySubmit({
      description,
      extraText: textBody,
      year,
      photoCount: photoFiles.length,
      hasVideo,
      permissionConfirmed,
      displayName,
    })
    if (contentErr) {
      setError(contentErr)
      return
    }
    if (creatingNewPin) {
      if (selectedArea.map_type === 'geo' && (placement?.lat == null || placement?.lng == null)) {
        setError('Tap the map where this memory happened.')
        return
      }
      if (selectedArea.map_type === 'image' && (placement?.x == null || placement?.y == null)) {
        setError('Tap the map where this memory happened.')
        return
      }
    }

    const storyTitle = deriveStoryTitle(finalDescription)
    const eventYear = eventDate ? parseInt(eventDate.slice(0, 4), 10) : parseInt(year, 10)
    const hasText = Boolean(finalDescription.trim())

    setSubmitting(true)
    setUploadProgress('Preparing upload…')
    try {
      const mediaPayloads = await uploadMediaWithProgress()
      const storyType = inferStoryType(hasVideo, hasPhoto, hasText)
      const { error: submitErr } = await submitMemoryStory(supabase, {
        memoryMapId: map.id,
        areaId: selectedArea.id,
        existingPinId: creatingNewPin ? null : pinTarget.pin.id,
        pinTitle: creatingNewPin ? pinTarget.title.trim() : undefined,
        pinDescription: creatingNewPin ? pinTarget.description.trim() : undefined,
        pinCategoryId,
        pinLat: placement?.lat ?? null,
        pinLng: placement?.lng ?? null,
        pinX: placement?.x ?? null,
        pinY: placement?.y ?? null,
        title: storyTitle,
        description: finalDescription,
        storyType,
        eventYear,
        uploadMode: resolveUploadMode(),
        riskLevel,
        loggedByDisplayName: displayName.trim(),
        hasPermissionConfirmed: permissionConfirmed,
        containsMinors,
        mentionsFullNames,
        showsInjury,
        isArchiveContent: archiveContent || isArchiveMemory,
        sponsorOrBrandVisible: sponsorBrandVisible,
        tags,
        media: mediaPayloads,
      })

      if (submitErr) throw new Error(submitErr)
      setUploadProgress('')
      void trackMemoryMapEvent(supabase, {
        memoryMapId: map.id,
        eventType: 'story_submitted',
        areaId: selectedArea.id,
      })
      setSheetStage('success')
    } catch (e) {
      setUploadProgress('')
      setError(e instanceof Error ? e.message : "We couldn't submit your memory. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function startAnother() {
    clearPinSelection()
    resetStoryFields()
    setUsedGps(false)
  }

  const sheetOpen = sheetStage != null
  const pinStoriesForTarget =
    pinTarget?.kind === 'existing'
      ? stories.filter((s) => s.pin_id === pinTarget.pin.id && s.status === 'approved')
      : []

  const fieldErrors = useMemo(
    () =>
      getQuickMemoryFieldErrors({
        description,
        extraText: textBody,
        year,
        photoCount: photoFiles.length,
        hasVideo: Boolean(videoFile),
        permissionConfirmed,
        displayName,
      }),
    [description, textBody, year, photoFiles.length, videoFile, permissionConfirmed, displayName]
  )

  if (accessLoading) {
    return (
      <div className="mm-root min-h-dvh" style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />
        <p className="mm-muted px-4 py-8 text-sm">Checking access…</p>
      </div>
    )
  }

  if (!access?.isLoggedIn) {
    return (
      <div className="mm-root min-h-dvh" style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />
        <section className="mx-auto max-w-lg space-y-4 px-4 py-8">
          <h1 className="text-2xl font-black">Add a memory</h1>
          <p className="mm-muted text-sm">Sign in to add a memory.</p>
          <Link href={buildLoginHref(returnPath)} className="mm-btn-primary block rounded-2xl px-4 py-3 text-center text-sm font-black">
            Sign in
          </Link>
        </section>
      </div>
    )
  }

  if (!canContribute) {
    return (
      <div className="mm-root min-h-dvh" style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}`} />
        <section className="mx-auto max-w-lg space-y-4 px-4 py-8">
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
              <p className="mm-muted text-sm">Request access to add memories to this map.</p>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
              <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Relationship (e.g. old boy, parent)" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
              <textarea value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="Why would you like to contribute?" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm" />
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button type="button" onClick={() => void onRequestAccess()} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
                Request access
              </button>
            </>
          )}
        </section>
      </div>
    )
  }

  if (mapAreas.length === 0) {
    return (
      <div className="mm-root min-h-dvh" style={memoryMapThemeVars(map)}>
        <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}/map`} />
        <div className="px-4 py-3">
          <h1 className="text-xl font-black">Add a memory</h1>
          <p className="mm-muted mt-1 text-sm">Tap a pin or tap the map where this memory happened.</p>
        </div>
        <div className="px-2 pb-4">
          <MemoryMapShell map={map} message="The school admin needs to create an area before memories can be placed on the map." />
        </div>
      </div>
    )
  }

  return (
    <div className="mm-root min-h-dvh" style={memoryMapThemeVars(map)}>
      <MemoryMapHeader map={map} mapSlug={map.slug} backHref={`/memory-map/${map.slug}/map`} areaName={selectedArea?.name} />

      <div className="lg:flex lg:min-h-[calc(100dvh-4rem)]">
        <div className={`min-w-0 flex-1 px-4 ${sheetOpen ? 'pb-2 lg:pb-4' : 'pb-4'}`}>
          <div className="mb-3">
            <h1 className="text-xl font-black">Add a memory</h1>
            <p className="mm-muted mt-1 text-sm">Tap a pin or tap the map where this memory happened.</p>
          </div>

          {!hasCategories ? (
            <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              The school admin needs to create a category before new places can be added.
            </div>
          ) : null}

          <p className="mm-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">Choose area</p>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mapAreas.map((area) => {
              const count = pins.filter((p) => p.area_id === area.id && p.status === 'approved').length
              const selected = selectedAreaId === area.id
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => selectArea(area.id)}
                  className={`min-h-[44px] shrink-0 rounded-2xl border px-4 py-2.5 text-left text-sm ${
                    selected ? 'border-[var(--mm-accent)] bg-[var(--mm-accent)]/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="font-bold leading-tight">{area.name}</p>
                  <p className="mm-muted mt-0.5 text-[11px]">{count} pins</p>
                </button>
              )
            })}
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onUseMyLocation} className="mm-btn-secondary rounded-full px-3 py-2 text-xs font-bold">
              Use my location
            </button>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`rounded-full px-3 py-2 text-xs font-bold ${showFilters ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
            >
              Filter pins
            </button>
            {pinTarget ? (
              <button type="button" onClick={clearPinSelection} className="mm-btn-secondary rounded-full px-3 py-2 text-xs font-bold">
                Choose another place
              </button>
            ) : null}
          </div>

          {geoMessage ? (
            <p className="mb-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{geoMessage}</p>
          ) : null}
          {areaPins.length === 0 && !sheetOpen ? (
            <p className="mm-muted mb-2 text-xs">No pins here yet — tap the map to add the first one.</p>
          ) : null}
          {error && !sheetOpen ? (
            <p className="mb-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          ) : null}

          {showFilters ? (
            <div className="mb-2 space-y-2">
              <input
                value={pinSearch}
                onChange={(e) => setPinSearch(e.target.value)}
                placeholder="Search pins…"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
              />
              <CategoryFilterPills categories={activeCategories} selectedId={categoryFilter} onSelect={setCategoryFilter} />
            </div>
          ) : null}

          {selectedArea ? (
            <div className={`-mx-2 ${sheetOpen ? 'min-h-[36vh] lg:min-h-[50vh]' : 'min-h-[52vh] lg:min-h-[50vh]'}`}>
              <MapCanvas
                area={selectedArea}
                pins={areaPins}
                mode={mapMode}
                onPinClick={onPinClick}
                placementMode
                placementPreview={placementPreview}
                onMapClick={onMapClick}
                locateTarget={locateTarget}
                initialView={areaInitialView}
                imageFocus={areaImageFocus}
              />
            </div>
          ) : null}
        </div>

        {sheetOpen ? (
          <ContributorAddSheet
            stage={sheetStage!}
            pinTarget={pinTarget}
            selectedAreaName={selectedArea?.name ?? ''}
            categories={activeCategories}
            pinStories={pinStoriesForTarget}
            mapSlug={map.slug}
            selectedAreaId={selectedAreaId}
            error={error}
            failedFileName={failedFileName}
            uploadProgress={uploadProgress}
            submitting={submitting}
            year={year}
            month={month}
            eventDate={eventDate}
            description={description}
            categoryId={categoryId}
            riskLevel={riskLevel}
            tagInput={tagInput}
            tags={tags}
            textBody={textBody}
            peopleInvolved={peopleInvolved}
            groupClassYear={groupClassYear}
            photoFiles={photoFiles}
            videoFile={videoFile}
            displayName={displayName}
            showMoreDetails={showMoreDetails}
            showTextEditor={showTextEditor}
            hasAutoDisplayName={hasAutoDisplayName}
            photoInputRef={photoInputRef}
            videoInputRef={videoInputRef}
            governance={governanceValues}
            onClose={clearPinSelection}
            onOpenStory={openStoryForm}
            onUpdateNewPin={updateNewPin}
            onMoveNewPin={() => {
              setSheetStage(null)
              setGeoMessage('Tap the map to move the pin.')
            }}
            onSubmit={() => void onSubmit()}
            onStartAnother={startAnother}
            addPhotoFiles={addPhotoFiles}
            setPhotoFiles={setPhotoFiles}
            setVideo={setVideo}
            setDisplayName={setDisplayName}
            setYear={setYear}
            setMonth={setMonth}
            setEventDate={setEventDate}
            setDescription={setDescription}
            setRiskLevel={setRiskLevel}
            setTagInput={setTagInput}
            setTags={setTags}
            setTextBody={setTextBody}
            setPeopleInvolved={setPeopleInvolved}
            setGroupClassYear={setGroupClassYear}
            setShowMoreDetails={setShowMoreDetails}
            setShowTextEditor={setShowTextEditor}
            setGovernanceFlag={setGovernanceFlag}
            onArchiveToggle={(checked) => {
              setIsArchiveMemory(checked)
              setArchiveContent(checked)
            }}
            submitAttempted={submitAttempted}
            fieldErrors={fieldErrors}
            canSubmit={hasCategories}
          />
        ) : null}
      </div>
    </div>
  )
}

type SheetProps = {
  stage: SheetStage
  pinTarget: PinTarget | null
  selectedAreaName: string
  selectedAreaId: string
  categories: MemoryMapBundle['categories']
  pinStories: MemoryMapBundle['stories']
  mapSlug: string
  error: string
  failedFileName: string | null
  uploadProgress: string
  submitting: boolean
  year: string
  month: string
  eventDate: string
  description: string
  categoryId: string
  riskLevel: RiskLevel
  tagInput: string
  tags: string[]
  textBody: string
  peopleInvolved: string
  groupClassYear: string
  photoFiles: File[]
  videoFile: File | null
  displayName: string
  showMoreDetails: boolean
  showTextEditor: boolean
  hasAutoDisplayName: boolean
  photoInputRef: React.RefObject<HTMLInputElement | null>
  videoInputRef: React.RefObject<HTMLInputElement | null>
  governance: StoryGovernanceFlags
  onClose: () => void
  onOpenStory: () => void
  onUpdateNewPin: (fields: Partial<Extract<PinTarget, { kind: 'new' }>>) => void
  onMoveNewPin: () => void
  onSubmit: () => void
  onStartAnother: () => void
  addPhotoFiles: (files: File[]) => void
  setPhotoFiles: (files: File[]) => void
  setVideo: (f: File | null) => void
  setDisplayName: (v: string) => void
  setYear: (v: string) => void
  setMonth: (v: string) => void
  setEventDate: (v: string) => void
  setDescription: (v: string) => void
  setRiskLevel: (v: RiskLevel) => void
  setTagInput: (v: string) => void
  setTags: (v: string[]) => void
  setTextBody: (v: string) => void
  setPeopleInvolved: (v: string) => void
  setGroupClassYear: (v: string) => void
  setShowMoreDetails: (v: boolean) => void
  setShowTextEditor: (v: boolean) => void
  setGovernanceFlag: (key: keyof StoryGovernanceFlags, value: boolean) => void
  onArchiveToggle: (checked: boolean) => void
  submitAttempted: boolean
  fieldErrors: QuickMemoryFieldErrors
  canSubmit: boolean
}

function ContributorAddSheet(props: SheetProps) {
  const {
    stage,
    pinTarget,
    selectedAreaName,
    selectedAreaId,
    categories,
    pinStories,
    mapSlug,
    error,
    failedFileName,
    uploadProgress,
    submitting,
    onClose,
    onOpenStory,
    onUpdateNewPin,
    onMoveNewPin,
    onSubmit,
    onStartAnother,
    canSubmit,
  } = props

  const pinTitle =
    pinTarget?.kind === 'existing' ? pinTarget.pin.title : pinTarget?.kind === 'new' ? pinTarget.title : ''

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Close" onClick={onClose} />
      <aside
        className={`mm-root fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border border-white/10 bg-[var(--mm-bg,#05080d)] shadow-2xl lg:static lg:z-auto lg:max-h-none lg:w-[min(100%,420px)] lg:shrink-0 lg:rounded-2xl ${
          stage === 'content' ? 'max-h-[85dvh]' : stage === 'success' ? 'max-h-[70dvh]' : 'max-h-[68dvh]'
        }`}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black">
                {stage === 'content' ? 'Add memory here' : stage === 'success' ? 'Submitted' : 'Add memory here'}
              </p>
              {pinTarget && stage !== 'success' ? (
                <p className="mm-muted mt-0.5 text-xs">
                  {pinTarget.kind === 'existing' ? `Adding to: ${pinTitle}` : `New place: ${pinTitle || 'Untitled'}`}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="text-xl text-white/50" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${stage === 'content' ? 'pb-2' : ''}`}>
          {error ? <p className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {failedFileName ? (
            <p className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              That file didn&apos;t upload. Remove it and try again, or pick a smaller file.
            </p>
          ) : null}
          {uploadProgress ? (
            <p className="mb-3 flex items-center gap-2 text-sm text-[var(--mm-accent)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {uploadProgress}
            </p>
          ) : null}

          {stage === 'pin-existing' && pinTarget?.kind === 'existing' ? (
            <ExistingPinPanel
              pin={pinTarget.pin}
              areaName={selectedAreaName}
              categories={categories}
              stories={pinStories}
              mapSlug={mapSlug}
              areaId={selectedAreaId}
              onAddMemory={onOpenStory}
              onChooseAnother={onClose}
            />
          ) : null}

          {stage === 'pin-new' && pinTarget?.kind === 'new' ? (
            <NewPinPanel pin={pinTarget} onUpdate={onUpdateNewPin} onAddMemory={onOpenStory} onMovePin={onMoveNewPin} onCancel={onClose} />
          ) : null}

          {stage === 'content' ? <QuickMemoryForm {...props} pinTitle={pinTitle} /> : null}

          {stage === 'success' ? (
            <div className="space-y-4 py-2 text-center">
              <p className="text-lg font-black leading-snug">Your memory has been submitted for school admin approval.</p>
              <Link
                href={`/memory-map/${mapSlug}/map${selectedAreaId ? `?area=${selectedAreaId}` : ''}`}
                className="mm-btn-primary block rounded-2xl px-4 py-3 text-sm font-black"
              >
                Back to map
              </Link>
              <button type="button" onClick={onStartAnother} className="mm-btn-secondary w-full rounded-2xl px-4 py-3 text-sm font-bold">
                Add another memory
              </button>
            </div>
          ) : null}
        </div>

        {stage === 'content' ? (
          <div className="shrink-0 border-t border-white/10 bg-[var(--mm-bg,#05080d)] px-4 py-3 mm-safe-bottom">
            {!canSubmit ? (
              <p className="mb-2 text-xs text-amber-200">The school admin needs to create a category before you can submit.</p>
            ) : null}
            <button
              type="button"
              disabled={submitting || !canSubmit}
              onClick={onSubmit}
              className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit for approval'}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full text-xs font-bold text-white/50">
              Cancel
            </button>
          </div>
        ) : null}
      </aside>
    </>
  )
}

function ExistingPinPanel({
  pin,
  areaName,
  categories,
  stories,
  mapSlug,
  areaId,
  onAddMemory,
  onChooseAnother,
}: {
  pin: MemoryPin
  areaName: string
  categories: MemoryMapBundle['categories']
  stories: MemoryMapBundle['stories']
  mapSlug: string
  areaId: string
  onAddMemory: () => void
  onChooseAnother: () => void
}) {
  const cat = categories.find((c) => c.id === pin.category_id)
  const latestYear = stories.length ? Math.max(...stories.map((s) => s.event_year)) : null

  return (
    <div className="space-y-4">
      <div className="mm-card rounded-2xl p-4 text-sm">
        <p className="font-black">{pin.title}</p>
        <p className="mm-muted mt-1 text-xs">{areaName} · {cat?.name ?? '—'}</p>
        {pin.description ? <p className="mt-2 text-xs text-white/80">{pin.description}</p> : null}
        <p className="mm-muted mt-2 text-xs">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          {yearRangeForStories(stories) ? ` · ${yearRangeForStories(stories)}` : ''}
          {latestYear ? ` · Latest ${latestYear}` : ''}
        </p>
      </div>
      {stories.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-white/50">Stories at this pin</p>
          {stories.slice(0, 3).map((story) => (
            <StoryCard key={story.id} story={story} mapSlug={mapSlug} compact showMeta />
          ))}
        </div>
      ) : null}
      <button type="button" onClick={onAddMemory} className="mm-btn-primary w-full rounded-2xl px-4 py-3.5 text-sm font-black">
        Add memory to this pin
      </button>
      {stories.length > 0 ? (
        <Link
          href={`/memory-map/${mapSlug}/map?area=${areaId}&pin=${pin.id}`}
          className="mm-btn-secondary block w-full rounded-xl px-4 py-2.5 text-center text-sm font-bold"
        >
          View stories
        </Link>
      ) : null}
      <button type="button" onClick={onChooseAnother} className="w-full py-1 text-xs font-bold text-white/50">
        Choose another place
      </button>
    </div>
  )
}

function NewPinPanel({
  pin,
  onUpdate,
  onAddMemory,
  onMovePin,
  onCancel,
}: {
  pin: Extract<PinTarget, { kind: 'new' }>
  onUpdate: (fields: Partial<Extract<PinTarget, { kind: 'new' }>>) => void
  onAddMemory: () => void
  onMovePin: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">New place on the map</p>
      <p className="mm-muted text-xs">Give this spot a short name so others can find it.</p>
      <label className="block text-sm font-semibold" htmlFor="new-pin-name">
        Name this place
      </label>
      <input
        id="new-pin-name"
        value={pin.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="e.g. Main rugby field"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
      />
      <button type="button" onClick={onAddMemory} disabled={!pin.title.trim()} className="mm-btn-primary w-full rounded-2xl px-4 py-3.5 text-sm font-black disabled:opacity-50">
        Add memory here
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={onMovePin} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold">
          Move pin
        </button>
        <button type="button" onClick={onCancel} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold">
          Cancel
        </button>
      </div>
    </div>
  )
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-amber-200">{message}</p>
}

function PhotoPreviewList({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f))
    setUrls(next)
    return () => next.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  if (files.length === 0) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
          {urls[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[i]} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="aspect-square w-full bg-white/5" />
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white"
          >
            Remove
          </button>
          <p className="truncate px-1 py-0.5 text-[9px] text-white/60">{f.name}</p>
        </div>
      ))}
    </div>
  )
}

function QuickMemoryForm(props: SheetProps & { pinTitle: string }) {
  const {
    pinTarget,
    pinTitle,
    selectedAreaName,
    year,
    month,
    eventDate,
    description,
    categoryId,
    riskLevel,
    tagInput,
    tags,
    textBody,
    photoFiles,
    videoFile,
    displayName,
    showMoreDetails,
    showTextEditor,
    hasAutoDisplayName,
    photoInputRef,
    videoInputRef,
    governance,
    categories,
    peopleInvolved,
    groupClassYear,
    submitAttempted,
    fieldErrors,
    addPhotoFiles,
    setPhotoFiles,
    setVideo,
    setDisplayName,
    setYear,
    setMonth,
    setEventDate,
    setDescription,
    setRiskLevel,
    setTagInput,
    setTags,
    setTextBody,
    setPeopleInvolved,
    setGroupClassYear,
    setShowMoreDetails,
    setShowTextEditor,
    setGovernanceFlag,
    onArchiveToggle,
  } = props

  const inheritedCategory =
    pinTarget?.kind === 'existing' ? pinTarget.pin.category_id : pinTarget?.kind === 'new' ? pinTarget.categoryId : null
  const categoryName = categories.find((c) => c.id === (inheritedCategory ?? categoryId))?.name
  const showHints = submitAttempted

  function removePhoto(index: number) {
    setPhotoFiles(photoFiles.filter((_, i) => i !== index))
  }

  const hasContent = photoFiles.length > 0 || Boolean(videoFile) || Boolean(textBody.trim())

  return (
    <div className="space-y-3 pb-1">
      <div className="mm-card rounded-xl p-3 text-xs">
        <p className="truncate"><span className="mm-muted">Area:</span> {selectedAreaName}</p>
        <p className="truncate"><span className="mm-muted">Pin:</span> {pinTitle}</p>
        {categoryName ? <p><span className="mm-muted">Category:</span> {categoryName}</p> : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Add your memory</p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className={`rounded-xl border-2 py-4 text-xs font-black ${photoFiles.length > 0 ? 'border-[var(--mm-accent)] bg-[var(--mm-accent)]/10' : 'border-white/15 bg-white/5'}`}
          >
            Photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className={`rounded-xl border-2 py-4 text-xs font-black ${videoFile ? 'border-[var(--mm-accent)] bg-[var(--mm-accent)]/10' : 'border-white/15 bg-white/5'}`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => setShowTextEditor(true)}
            className={`rounded-xl border-2 py-4 text-xs font-black ${textBody.trim() ? 'border-[var(--mm-accent)] bg-[var(--mm-accent)]/10' : 'border-white/15 bg-white/5'}`}
          >
            Text
          </button>
        </div>
        <FieldHint message={showHints ? fieldErrors.content : undefined} />
      </div>
      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { addPhotoFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />

      <PhotoPreviewList files={photoFiles} onRemove={removePhoto} />
      {videoFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold">VIDEO</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{videoFile.name}</p>
            <p className="mm-muted text-[10px]">Ready to upload</p>
          </div>
          <button type="button" onClick={() => setVideo(null)} className="shrink-0 text-xs font-bold text-red-300">
            Remove
          </button>
        </div>
      ) : null}
      {showTextEditor ? (
        <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Written memory (optional)" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="memory-year">
          Year this happened
        </label>
        <input
          id="memory-year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="e.g. 2024"
          type="number"
          inputMode="numeric"
          className={`w-full rounded-xl border bg-white/5 px-3 py-2.5 text-sm ${showHints && fieldErrors.year ? 'border-amber-400/60' : 'border-white/15'}`}
        />
        <FieldHint message={showHints ? fieldErrors.year : undefined} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="memory-description">
          What happened here?
        </label>
        <textarea
          id="memory-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us briefly what happened here."
          rows={3}
          className={`w-full rounded-xl border bg-white/5 px-3 py-2.5 text-sm ${showHints && fieldErrors.description ? 'border-amber-400/60' : 'border-white/15'}`}
        />
        <FieldHint message={showHints ? fieldErrors.description : undefined} />
      </div>

      {!hasAutoDisplayName ? (
        <div>
          <label className="mb-1 block text-sm font-semibold" htmlFor="memory-name">
            Your name
          </label>
          <input
            id="memory-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we show your name?"
            className={`w-full rounded-xl border bg-white/5 px-3 py-2.5 text-sm ${showHints && fieldErrors.name ? 'border-amber-400/60' : 'border-white/15'}`}
          />
          <FieldHint message={showHints ? fieldErrors.name : undefined} />
        </div>
      ) : null}

      <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${showHints && fieldErrors.permission ? 'border-amber-400/60 bg-amber-500/5' : 'border-transparent'}`}>
        <input
          type="checkbox"
          checked={governance.hasPermissionConfirmed}
          onChange={(e) => setGovernanceFlag('hasPermissionConfirmed', e.target.checked)}
          className="mt-0.5"
        />
        <span>I confirm I have permission to submit this memory.</span>
      </label>
      <FieldHint message={showHints ? fieldErrors.permission : undefined} />

      <button
        type="button"
        onClick={() => setShowMoreDetails(!showMoreDetails)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left text-sm font-bold"
      >
        <span>Add more details</span>
        <span className="text-xs text-white/50">{showMoreDetails ? '−' : '+'}</span>
      </button>
      {!showMoreDetails ? (
        <p className="mm-muted -mt-2 text-[10px]">Optional — tags, people, exact date or extra context.</p>
      ) : null}

      {showMoreDetails ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
            {MONTHS.map((m) => (
              <option key={m.value || 'empty'} value={m.value}>{m.label}</option>
            ))}
          </select>
          <input value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tags — Rugby, hostel, interschools…" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={() => {
                const t = tagInput.trim().toLowerCase()
                if (t && !tags.includes(t)) setTags([...tags, t])
                setTagInput('')
              }}
              className="mm-btn-secondary shrink-0 rounded-xl px-3 text-xs font-bold"
            >
              Add
            </button>
          </div>
          {tags.length > 0 ? <p className="break-words text-xs text-white/60">{tags.map((t) => `#${t}`).join(' ')}</p> : null}
          <input value={peopleInvolved} onChange={(e) => setPeopleInvolved(e.target.value)} placeholder="People involved" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <p className="mm-muted -mt-2 text-[10px]">Optional. Add names only if appropriate.</p>
          <input value={groupClassYear} onChange={(e) => setGroupClassYear(e.target.value)} placeholder="Team / group / class / year" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          <div>
            <label className="mb-1 block text-xs font-semibold">Admin review note</label>
            <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
              {CONTRIBUTOR_REVIEW_NOTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            {OPTIONAL_GOVERNANCE_CHECKBOXES.map(({ key, label }) => (
              <label key={key} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={governance[key]}
                  onChange={(e) => {
                    const checked = e.target.checked
                    if (key === 'isArchiveContent') onArchiveToggle(checked)
                    setGovernanceFlag(key, checked)
                  }}
                  className="mt-0.5"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {!showTextEditor ? (
            <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Longer written story (optional)" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
          ) : null}
        </div>
      ) : null}

      {hasContent ? (
        <p className="mm-muted text-center text-[10px]">
          {photoFiles.length + (videoFile ? 1 : 0)} file{photoFiles.length + (videoFile ? 1 : 0) === 1 ? '' : 's'} selected
        </p>
      ) : null}
    </div>
  )
}
