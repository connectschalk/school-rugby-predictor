'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { activeAreas } from '@/lib/memory-map/add-story-placement'
import { validateAdminStoryDraft } from '@/lib/memory-map/admin-create-validation'
import { inferStoryType } from '@/lib/memory-map/infer-story-type'
import { publishOptionLabel, type AdminPublishOption } from '@/lib/memory-map/official-content'
import { adminCreateMemoryStory, type StoryMediaPayload } from '@/lib/memory-map/mutations'
import { getImageMapInitialFocus, getMapInitialView } from '@/lib/memory-map/map-starting-point'
import {
  ADMIN_REVIEW_LEVEL_OPTIONS,
  CONTRIBUTOR_GOVERNANCE_CHECKBOXES,
  type StoryGovernanceFlags,
} from '@/lib/memory-map/review-level'
import { uploadPendingStoryMedia } from '@/lib/memory-map/storage'
import { useMemoryMapGeolocation } from '@/lib/memory-map/use-memory-map-geolocation'
import type { AdminTab, MapPlacement, MemoryMapBundle, MemoryPin, RiskLevel } from '@/lib/memory-map/types'
import { areaMapTypeLabel, storyTypeLabel, yearRangeForStories } from '@/lib/memory-map/utils'
import {
  MM_MAX_PHOTOS_PER_STORY,
  defaultCategoryId,
  validateImageFile,
  validateVideoFile,
} from '@/lib/memory-map/validation'
import MapCanvas from '@/components/memory-map/MapCanvas'
import CategoryFilterPills from '@/components/memory-map/CategoryFilterPills'
import MemoryMapShell from '@/components/memory-map/MemoryMapShell'
import { OfficialBadge } from '@/components/memory-map/StatusBadge'

type Props = {
  bundle: MemoryMapBundle
  mapId: string
  onNavigate: (tab: AdminTab) => void
  onSaved: () => void
}

type PinTarget =
  | { kind: 'existing'; pin: MemoryPin }
  | {
      kind: 'new'
      placement: MapPlacement
      title: string
      description: string
      categoryId: string
      pinIsOfficial: boolean
    }

type SheetStage = 'pin-existing' | 'pin-new' | 'content' | 'success'

export default function AdminAddContentWizard({ bundle, mapId, onNavigate, onSaved }: Props) {
  const { map, areas, categories, pins, stories } = bundle
  const mapAreas = useMemo(() => activeAreas(areas), [areas])
  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories])
  const hasAreas = mapAreas.length > 0
  const hasCategories = activeCategories.length > 0

  const [selectedAreaId, setSelectedAreaId] = useState(mapAreas[0]?.id ?? '')
  const [dropPinMode, setDropPinMode] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [pinSearch, setPinSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<PinTarget | null>(null)
  const [tempPlacement, setTempPlacement] = useState<MapPlacement | null>(null)
  const [sheetStage, setSheetStage] = useState<SheetStage | null>(null)
  const [locateTarget, setLocateTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const geo = useMemoryMapGeolocation()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [savedStoryId, setSavedStoryId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState('')

  const [title, setTitle] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? '')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('low')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [textBody, setTextBody] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [isOfficial, setIsOfficial] = useState(true)
  const [displayName, setDisplayName] = useState('School Admin')
  const [publishOption, setPublishOption] = useState<AdminPublishOption>('approved')
  const [showExtraDetails, setShowExtraDetails] = useState(false)
  const [showDateDetails, setShowDateDetails] = useState(false)
  const [containsMinors, setContainsMinors] = useState(false)
  const [mentionsFullNames, setMentionsFullNames] = useState(false)
  const [showsInjury, setShowsInjury] = useState(false)
  const [archiveContent, setArchiveContent] = useState(false)
  const [sponsorBrandVisible, setSponsorBrandVisible] = useState(false)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const name =
        (data.user?.user_metadata?.display_name as string | undefined) ??
        (data.user?.user_metadata?.full_name as string | undefined)
      if (name?.trim()) setDisplayName(name.trim())
    })
  }, [])

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
      .filter((p) => p.area_id === selectedArea?.id && !['deleted', 'archived'].includes(p.status))
      .filter((p) => (categoryFilter ? p.category_id === categoryFilter : true))
      .filter((p) => (q ? p.title.toLowerCase().includes(q) : true))
  }, [pins, selectedArea?.id, categoryFilter, pinSearch])

  const placementPreview = useMemo(() => {
    if (pinTarget?.kind === 'new') return pinTarget.placement
    if (tempPlacement) return tempPlacement
    return null
  }, [pinTarget, tempPlacement])

  const uploadMode = selectedArea?.map_type === 'image' ? ('manual_image_map' as const) : ('manual_geo' as const)

  function clearPinSelection() {
    setPinTarget(null)
    setTempPlacement(null)
    setSheetStage(null)
    setDropPinMode(false)
    setError('')
  }

  function resetContentFields() {
    setTitle('')
    setYear(String(new Date().getFullYear()))
    setEventDate('')
    setDescription('')
    setTextBody('')
    setPhotoFiles([])
    setVideoFile(null)
    setTags([])
    setTagInput('')
    setIsOfficial(true)
    setPublishOption('approved')
    setContainsMinors(false)
    setMentionsFullNames(false)
    setShowsInjury(false)
    setArchiveContent(false)
    setSponsorBrandVisible(false)
    setRiskLevel('low')
    setError('')
    setUploadProgress('')
  }

  function selectArea(areaId: string) {
    setSelectedAreaId(areaId)
    clearPinSelection()
    geo.clear()
    setLocateTarget(null)
  }

  function openExistingPin(pin: MemoryPin) {
    setDropPinMode(false)
    setTempPlacement(null)
    setPinTarget({ kind: 'existing', pin })
    setCategoryId(pin.category_id ?? activeCategories[0]?.id ?? '')
    resetContentFields()
    setSheetStage('pin-existing')
  }

  function onMapClick(placement: MapPlacement) {
    if (!dropPinMode) return
    setTempPlacement(placement)
    setPinTarget({
      kind: 'new',
      placement,
      title: '',
      description: '',
      categoryId: defaultCategoryId(activeCategories),
      pinIsOfficial: true,
    })
    setSheetStage('pin-new')
  }

  function onPinClick(pin: MemoryPin) {
    openExistingPin(pin)
  }

  function onUseLocationForContent() {
    if (!geo.location) return
    const { lat, lng } = geo.location
    setLocateTarget({ lat, lng })
    setDropPinMode(true)
    setTempPlacement({ lat, lng })
    setPinTarget({
      kind: 'new',
      placement: { lat, lng },
      title: '',
      description: '',
      categoryId: defaultCategoryId(activeCategories),
      pinIsOfficial: true,
    })
    setSheetStage('pin-new')
  }

  useEffect(() => {
    if (geo.status === 'success' && geo.location) {
      setLocateTarget({ lat: geo.location.lat, lng: geo.location.lng })
    }
  }, [geo.status, geo.location])

  function updateNewPin(fields: Partial<Extract<PinTarget, { kind: 'new' }>>) {
    if (pinTarget?.kind !== 'new') return
    setPinTarget({ ...pinTarget, ...fields })
  }

  function openContentForm() {
    if (pinTarget?.kind === 'existing') {
      setCategoryId(pinTarget.pin.category_id ?? categoryId)
    } else if (pinTarget?.kind === 'new') {
      if (!pinTarget.title.trim()) {
        setError('Enter a pin title before adding content.')
        return
      }
      setCategoryId(pinTarget.categoryId)
    }
    setError('')
    setSheetStage('content')
  }

  function addPhotoFiles(files: File[]) {
    setError('')
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
      if ('error' in up) throw new Error('Upload failed. Remove the file or try again.')
      payloads.push({ ...up, thumbnail_url: kind === 'image' ? up.file_url : null })
    }
    return payloads
  }

  async function onSubmit(status: AdminPublishOption) {
    if (!pinTarget || !selectedArea) return
    setError('')
    const eventYear = parseInt(year, 10)
    const finalDescription = [description.trim(), textBody.trim()].filter(Boolean).join('\n\n')
    const hasText = Boolean(textBody.trim() || description.trim())
    const hasPhoto = photoFiles.length > 0
    const hasVideo = Boolean(videoFile)
    const creatingNewPin = pinTarget.kind === 'new'
    const placement = creatingNewPin ? pinTarget.placement : null

    const draftErr = validateAdminStoryDraft({
      title,
      description: finalDescription,
      year,
      categoryId: creatingNewPin ? defaultCategoryId(activeCategories) || null : (pinTarget.pin.category_id ?? categoryId),
      riskLevel,
      photoCount: photoFiles.length,
      hasVideo,
      hasText,
      selectedAreaId: selectedArea.id,
      selectedPinId: creatingNewPin ? null : pinTarget.pin.id,
      creatingNewPin,
      newPinTitle: creatingNewPin ? pinTarget.title : '',
      hasPinPlacement: Boolean(
        placement &&
          ((selectedArea.map_type === 'geo' && placement.lat != null) ||
            (selectedArea.map_type === 'image' && placement.x != null))
      ),
    })
    if (draftErr) {
      setError(draftErr)
      return
    }

    setSubmitting(true)
    setUploadProgress('Preparing upload…')
    try {
      const mediaPayloads = await uploadMediaWithProgress()
      const storyType = inferStoryType(hasVideo, hasPhoto, hasText)
      const governanceFlags = {
        admin_created: true,
        contains_minors: containsMinors,
        mentions_full_names: mentionsFullNames,
        shows_injury: showsInjury,
        is_archive_content: archiveContent,
        sponsor_or_brand_visible: sponsorBrandVisible,
        has_permission_confirmed: true,
      }

      const pinCategoryId = creatingNewPin ? null : (pinTarget.pin.category_id ?? categoryId)

      const { storyId, error: submitErr } = await adminCreateMemoryStory(supabase, {
        memoryMapId: mapId,
        areaId: selectedArea.id,
        existingPinId: creatingNewPin ? null : pinTarget.pin.id,
        createNewPin: creatingNewPin,
        pinTitle: creatingNewPin ? pinTarget.title.trim() : undefined,
        pinDescription: creatingNewPin ? pinTarget.description.trim() : undefined,
        pinCategoryId,
        pinLat: placement?.lat ?? null,
        pinLng: placement?.lng ?? null,
        pinX: placement?.x ?? null,
        pinY: placement?.y ?? null,
        title: title.trim(),
        description: finalDescription,
        storyType,
        eventYear,
        eventDate: eventDate || null,
        uploadMode,
        riskLevel,
        loggedByDisplayName: displayName.trim() || 'School Admin',
        isOfficial,
        pinIsOfficial: creatingNewPin ? pinTarget.pinIsOfficial : Boolean(pinTarget.pin.is_official),
        status,
        governanceFlags,
        tags,
        media: mediaPayloads,
      })

      if (submitErr) throw new Error(submitErr)
      setUploadProgress('')
      setSavedStoryId(storyId)
      setSheetStage('success')
      onSaved()
    } catch (e) {
      setUploadProgress('')
      setError(e instanceof Error ? e.message : 'Could not save content.')
    } finally {
      setSubmitting(false)
    }
  }

  function startAnother() {
    clearPinSelection()
    resetContentFields()
    setSavedStoryId(null)
  }

  const sheetOpen = sheetStage != null
  const pinStoriesForTarget =
    pinTarget?.kind === 'existing'
      ? stories.filter((s) => s.pin_id === pinTarget.pin.id && !['deleted', 'archived'].includes(s.status))
      : []

  return (
    <div className="lg:flex lg:min-h-[calc(100dvh-12rem)] lg:gap-0">
      <div className={`min-w-0 flex-1 ${sheetOpen ? 'lg:pr-0' : ''}`}>
        <div className="mb-3 px-1">
          <h2 className="text-xl font-black">Add official content</h2>
          <p className="mm-muted mt-1 text-sm">
            Choose an area, then tap a pin or drop a new pin where the memory happened.
          </p>
        </div>

        {!hasAreas ? (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Create an area before placing content on the map.
          </div>
        ) : null}

        {!hasCategories ? (
          <p className="mb-3 text-xs text-white/60">
            Using General category automatically. You can organise categories later in Map Setup.
          </p>
        ) : null}

        {hasAreas ? (
          <div className="mb-3 flex gap-2 overflow-x-auto px-1 mm-hide-scrollbar">
            {mapAreas.map((area) => {
              const count = pins.filter((p) => p.area_id === area.id && !['deleted', 'archived'].includes(p.status)).length
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => selectArea(area.id)}
                  className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs ${
                    selectedAreaId === area.id ? 'mm-border-accent mm-bg-accent-10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="font-bold">{area.name}</p>
                  <p className="mm-muted mt-0.5">{areaMapTypeLabel(area)} · {count} pins</p>
                </button>
              )
            })}
          </div>
        ) : null}

        {hasAreas ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
          {mapMode === 'geo' ? (
            <>
              <button
                type="button"
                onClick={() => geo.locate()}
                disabled={geo.status === 'loading'}
                className="mm-btn-secondary rounded-full px-3 py-1.5 text-xs font-bold"
              >
                {geo.status === 'loading' ? 'Finding location…' : 'Show my location'}
              </button>
              {geo.status === 'success' && geo.location ? (
                <button
                  type="button"
                  onClick={onUseLocationForContent}
                  className="mm-btn-primary rounded-full px-3 py-1.5 text-xs font-bold"
                >
                  Use this location for new content
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setDropPinMode((v) => !v)
              if (dropPinMode) clearPinSelection()
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${dropPinMode ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
          >
            {dropPinMode ? 'Drop pin mode on' : 'Drop new pin'}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${showFilters ? 'mm-btn-primary' : 'mm-btn-secondary'}`}
          >
            Filters
          </button>
          {pinTarget ? (
            <button type="button" onClick={clearPinSelection} className="mm-btn-secondary rounded-full px-3 py-1.5 text-xs font-bold">
              Clear pin
            </button>
          ) : null}
          <button
            type="button"
            disabled={!pinTarget || (pinTarget.kind === 'new' && !pinTarget.title.trim())}
            onClick={openContentForm}
            className="mm-btn-primary rounded-full px-3 py-1.5 text-xs font-black disabled:opacity-40"
          >
            Add content
          </button>
        </div>
        ) : null}

        {hasAreas && dropPinMode ? (
          <p className="mb-2 rounded-xl border mm-border-accent-40 mm-bg-accent-10 px-3 py-2 text-xs mm-text-accent">
            Tap the map where this content happened.
          </p>
        ) : null}
        {geo.message ? (
          <p className="mb-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{geo.message}</p>
        ) : null}
        {hasAreas && areaPins.length === 0 && !dropPinMode ? (
          <p className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80">
            No pins here yet. Tap the map or use Drop new pin to add the first memory.
          </p>
        ) : null}

        {hasAreas && showFilters ? (
          <div className="mb-2 space-y-2 px-1">
            <input
              value={pinSearch}
              onChange={(e) => setPinSearch(e.target.value)}
              placeholder="Search pins…"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
            <CategoryFilterPills
              categories={activeCategories}
              selectedId={categoryFilter}
              onSelect={setCategoryFilter}
            />
          </div>
        ) : null}

        {hasAreas && selectedArea ? (
          <div className="-mx-2 min-h-[50vh] lg:min-h-[calc(100dvh-16rem)]">
            <MapCanvas
              area={selectedArea}
              pins={areaPins}
              mode={mapMode}
              onPinClick={onPinClick}
              placementMode={dropPinMode}
              placementPreview={placementPreview}
              onMapClick={onMapClick}
              locateTarget={locateTarget}
              userLocation={geo.status === 'success' ? geo.location : null}
              initialView={areaInitialView}
              imageFocus={areaImageFocus}
            />
          </div>
        ) : (
          <div className="-mx-2 min-h-[50vh] lg:min-h-[calc(100dvh-16rem)]">
            <MemoryMapShell map={map} message="Create your first area to start adding content to the map.">
              <button type="button" onClick={() => onNavigate('areas')} className="mm-btn-primary rounded-xl px-4 py-2 text-xs font-bold">
                Create area
              </button>
              <button type="button" onClick={() => onNavigate('map-defaults')} className="mm-btn-secondary rounded-xl px-4 py-2 text-xs font-bold">
                Use Memory Map default location
              </button>
            </MemoryMapShell>
          </div>
        )}
      </div>

      {sheetOpen ? (
        <AddContentSheet
          stage={sheetStage!}
          pinTarget={pinTarget}
          selectedAreaName={selectedArea?.name ?? ''}
          categories={activeCategories}
          pinStories={pinStoriesForTarget}
          canPublish={true}
          error={error}
          uploadProgress={uploadProgress}
          submitting={submitting}
          savedStoryId={savedStoryId}
          mapSlug={map.slug}
          title={title}
          year={year}
          eventDate={eventDate}
          description={description}
          categoryId={categoryId}
          riskLevel={riskLevel}
          tagInput={tagInput}
          tags={tags}
          textBody={textBody}
          photoFiles={photoFiles}
          videoFile={videoFile}
          isOfficial={isOfficial}
          displayName={displayName}
          publishOption={publishOption}
          showExtraDetails={showExtraDetails}
          showDateDetails={showDateDetails}
          governance={{
            containsMinors,
            mentionsFullNames,
            showsInjury,
            isArchiveContent: archiveContent,
            sponsorOrBrandVisible: sponsorBrandVisible,
            hasPermissionConfirmed: true,
          }}
          onClose={clearPinSelection}
          onNavigate={onNavigate}
          onUpdateNewPin={updateNewPin}
          onOpenContent={openContentForm}
          onStartAnother={startAnother}
          onSubmit={onSubmit}
          setTitle={setTitle}
          setYear={setYear}
          setEventDate={setEventDate}
          setDescription={setDescription}
          setCategoryId={setCategoryId}
          setRiskLevel={setRiskLevel}
          setTagInput={setTagInput}
          setTags={setTags}
          setTextBody={setTextBody}
          setPhotoFiles={setPhotoFiles}
          addPhotoFiles={addPhotoFiles}
          setVideo={setVideo}
          setIsOfficial={setIsOfficial}
          setDisplayName={setDisplayName}
          setPublishOption={setPublishOption}
          setGovernanceFlag={(key, value) => {
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
            }
          }}
          onMoveNewPin={() => {
            setDropPinMode(true)
            setSheetStage(null)
          }}
        />
      ) : null}
    </div>
  )
}

type SheetProps = {
  stage: SheetStage
  pinTarget: PinTarget | null
  selectedAreaName: string
  categories: MemoryMapBundle['categories']
  pinStories: MemoryMapBundle['stories']
  error: string
  uploadProgress: string
  submitting: boolean
  savedStoryId: string | null
  mapSlug: string
  title: string
  year: string
  eventDate: string
  description: string
  categoryId: string
  riskLevel: RiskLevel
  tagInput: string
  tags: string[]
  textBody: string
  photoFiles: File[]
  videoFile: File | null
  isOfficial: boolean
  displayName: string
  publishOption: AdminPublishOption
  showExtraDetails: boolean
  showDateDetails: boolean
  governance: StoryGovernanceFlags
  canPublish: boolean
  onClose: () => void
  onNavigate: (tab: AdminTab) => void
  onUpdateNewPin: (fields: Partial<Extract<PinTarget, { kind: 'new' }>>) => void
  onOpenContent: () => void
  onStartAnother: () => void
  onSubmit: (status: AdminPublishOption) => void
  onMoveNewPin: () => void
  setTitle: (v: string) => void
  setYear: (v: string) => void
  setEventDate: (v: string) => void
  setDescription: (v: string) => void
  setCategoryId: (v: string) => void
  setRiskLevel: (v: RiskLevel) => void
  setTagInput: (v: string) => void
  setTags: (v: string[]) => void
  setTextBody: (v: string) => void
  setPhotoFiles: (v: File[]) => void
  addPhotoFiles: (files: File[]) => void
  setVideo: (f: File | null) => void
  setIsOfficial: (v: boolean) => void
  setDisplayName: (v: string) => void
  setPublishOption: (v: AdminPublishOption) => void
  setGovernanceFlag: (key: keyof StoryGovernanceFlags, value: boolean) => void
}

function AddContentSheet(props: SheetProps) {
  const {
    stage,
    pinTarget,
    selectedAreaName,
    categories,
    pinStories,
    error,
    uploadProgress,
    submitting,
    savedStoryId,
    mapSlug,
    onClose,
    onNavigate,
    onUpdateNewPin,
    onOpenContent,
    onStartAnother,
    onSubmit,
    onMoveNewPin,
    canPublish,
  } = props

  const pinTitle =
    pinTarget?.kind === 'existing' ? pinTarget.pin.title : pinTarget?.kind === 'new' ? pinTarget.title : ''

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Close panel" onClick={onClose} />
      <aside
        className={`mm-root fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border border-white/10 mm-bg-panel shadow-2xl lg:static lg:z-auto lg:max-h-none lg:w-[min(100%,420px)] lg:shrink-0 lg:rounded-2xl lg:border lg:border-white/10`}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black">{stage === 'content' ? 'Add content' : stage === 'success' ? 'Saved' : 'Pin selected'}</p>
              {pinTarget && stage !== 'success' ? (
                <p className="mm-muted mt-0.5 text-xs">
                  {pinTarget.kind === 'existing' ? `Adding to: ${pinTitle}` : `Creating new pin: ${pinTitle || 'Untitled'}`}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="text-xl text-white/50" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <p className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {uploadProgress ? <p className="mb-3 text-sm mm-text-accent">{uploadProgress}</p> : null}

          {stage === 'pin-existing' && pinTarget?.kind === 'existing' ? (
            <ExistingPinSummary
              pin={pinTarget.pin}
              areaName={selectedAreaName}
              categories={categories}
              stories={pinStories}
              onAddContent={onOpenContent}
              onEditPin={() => onNavigate('pins')}
            />
          ) : null}

          {stage === 'pin-new' && pinTarget?.kind === 'new' ? (
            <NewPinForm
              pin={pinTarget}
              onUpdate={onUpdateNewPin}
              onAddContent={onOpenContent}
              onMovePin={onMoveNewPin}
              onClear={onClose}
            />
          ) : null}

          {stage === 'content' ? (
            <ContentForm {...props} pinTitle={pinTitle} />
          ) : null}

          {stage === 'success' ? (
            <div className="space-y-3 text-center">
              <p className="text-lg font-black">Content added to the Memory Map.</p>
              <Link href={`/memory-map/${mapSlug}/map`} className="mm-btn-primary block rounded-2xl px-4 py-3 text-sm font-black">
                View on public map
              </Link>
              <button type="button" onClick={onStartAnother} className="mm-btn-secondary w-full rounded-2xl px-4 py-3 text-sm font-bold">
                Add another content item
              </button>
              <button type="button" onClick={() => onNavigate('published')} className="mm-btn-secondary w-full rounded-2xl px-4 py-3 text-sm font-bold">
                Go to published stories
              </button>
              {savedStoryId ? (
                <Link href={`/memory-map/${mapSlug}/story/${savedStoryId}`} className="text-xs font-bold mm-text-accent">
                  Preview story →
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {stage === 'content' ? (
          <div className="shrink-0 border-t border-white/10 px-4 py-3 mm-safe-bottom">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={submitting || !canPublish}
                onClick={() => void onSubmit('approved')}
                className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
              >
                {submitting ? 'Publishing…' : 'Publish'}
              </button>
              <div className="flex gap-2">
                <button type="button" disabled={submitting || !canPublish} onClick={() => void onSubmit('draft')} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold disabled:opacity-50">
                  Save draft
                </button>
                <button type="button" disabled={submitting || !canPublish} onClick={() => void onSubmit('pending_review')} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold disabled:opacity-50">
                  Save for review
                </button>
              </div>
              <button type="button" onClick={onClose} className="text-xs font-bold text-white/50">
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  )
}

function ExistingPinSummary({
  pin,
  areaName,
  categories,
  stories,
  onAddContent,
  onEditPin,
}: {
  pin: MemoryPin
  areaName: string
  categories: MemoryMapBundle['categories']
  stories: MemoryMapBundle['stories']
  onAddContent: () => void
  onEditPin: () => void
}) {
  const cat = categories.find((c) => c.id === pin.category_id)
  const yearRange = yearRangeForStories(stories)
  const latestYear = stories.length ? Math.max(...stories.map((s) => s.event_year)) : null

  return (
    <div className="space-y-4">
      <div className="mm-card rounded-2xl p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black">{pin.title}</p>
          {pin.is_official ? <OfficialBadge /> : null}
        </div>
        <p className="mm-muted mt-1 text-xs">{areaName} · {cat?.name ?? '—'}</p>
        <p className="mm-muted mt-1 text-xs">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          {yearRange ? ` · ${yearRange}` : ''}
          {latestYear ? ` · Latest ${latestYear}` : ''}
        </p>
      </div>
      <button type="button" onClick={onAddContent} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black">
        Add to this pin
      </button>
      <button type="button" onClick={onEditPin} className="mm-btn-secondary w-full rounded-xl px-4 py-2 text-sm font-bold">
        Edit pin
      </button>
    </div>
  )
}

function NewPinForm({
  pin,
  onUpdate,
  onAddContent,
  onMovePin,
  onClear,
}: {
  pin: Extract<PinTarget, { kind: 'new' }>
  onUpdate: (fields: Partial<Extract<PinTarget, { kind: 'new' }>>) => void
  onAddContent: () => void
  onMovePin: () => void
  onClear: () => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">New place on the map</p>
      <input
        value={pin.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder="Name this place"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm"
      />
      <button type="button" onClick={onAddContent} disabled={!pin.title.trim()} className="mm-btn-primary w-full rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50">
        Add memory here
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={onMovePin} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold">
          Move pin
        </button>
        <button type="button" onClick={onClear} className="mm-btn-secondary flex-1 rounded-xl py-2 text-xs font-bold">
          Cancel
        </button>
      </div>
    </div>
  )
}

function ContentForm(props: SheetProps & { pinTitle: string }) {
  const {
    pinTitle,
    pinTarget,
    title,
    year,
    eventDate,
    description,
    categoryId,
    riskLevel,
    tagInput,
    tags,
    textBody,
    photoFiles,
    videoFile,
    isOfficial,
    displayName,
    publishOption,
    governance,
    categories,
    setTitle,
    setYear,
    setEventDate,
    setDescription,
    setCategoryId,
    setRiskLevel,
    setTagInput,
    setTags,
    setTextBody,
    addPhotoFiles,
    setVideo,
    setIsOfficial,
    setDisplayName,
    setPublishOption,
    setGovernanceFlag,
  } = props

  const inheritedCategory =
    pinTarget?.kind === 'existing' ? pinTarget.pin.category_id : pinTarget?.kind === 'new' ? pinTarget.categoryId : null

  return (
    <div className="space-y-3 pb-4">
      <p className="text-xs text-white/60">
        {pinTarget?.kind === 'existing' ? `Adding to: ${pinTitle}` : `Creating new pin: ${pinTitle}`}
      </p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Story title *" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year happened *" type="number" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <input value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description *" rows={3} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <select
        value={inheritedCategory ?? categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        disabled={Boolean(inheritedCategory)}
        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm disabled:opacity-60"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm">
        {ADMIN_REVIEW_LEVEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Logged by" className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} className="mt-0.5" />
        <span>Mark as official school content</span>
      </label>
      <div className="flex gap-2">
        <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm" />
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
      <textarea value={textBody} onChange={(e) => setTextBody(e.target.value)} placeholder="Written story (optional)" rows={2} className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm" />
      <div className="mm-card rounded-xl border-dashed p-3">
        <p className="text-xs font-bold">Photos</p>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-2 w-full text-xs" onChange={(e) => { addPhotoFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        {photoFiles.map((f, i) => (
          <p key={`${f.name}-${i}`} className="mt-1 truncate text-xs">{f.name}</p>
        ))}
      </div>
      <div className="mm-card rounded-xl border-dashed p-3">
        <p className="text-xs font-bold">Video</p>
        <input type="file" accept="video/mp4,video/quicktime,video/webm" className="mt-2 w-full text-xs" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
        {videoFile ? <p className="mt-1 truncate text-xs">{videoFile.name}</p> : null}
      </div>
      <div className="space-y-1 rounded-xl border border-white/10 p-2">
        {CONTRIBUTOR_GOVERNANCE_CHECKBOXES.map(({ key, label }) => (
          <label key={key} className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={governance[key]} onChange={(e) => setGovernanceFlag(key, e.target.checked)} className="mt-0.5" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-bold">Publish option</legend>
        {(['approved', 'draft', 'pending_review'] as AdminPublishOption[]).map((option) => (
          <label key={option} className="flex items-center gap-2 text-xs">
            <input type="radio" name="publish" checked={publishOption === option} onChange={() => setPublishOption(option)} />
            {publishOptionLabel(option)}
          </label>
        ))}
      </fieldset>
      <p className="mm-muted text-[10px]">
        Type: {storyTypeLabel(inferStoryType(Boolean(videoFile), photoFiles.length > 0, Boolean(textBody.trim() || description.trim())))}
      </p>
    </div>
  )
}
