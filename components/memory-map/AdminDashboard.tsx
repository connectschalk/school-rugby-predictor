'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchAuditLogs, fetchAdminMemoryMapBundleClient } from '@/lib/memory-map/client-queries'
import { fetchAllMembers } from '@/lib/memory-map/membership'
import { fetchMemoryMapAnalytics, type MemoryMapAnalyticsSummary } from '@/lib/memory-map/analytics'
import { fetchUserIsAdmin } from '@/lib/admin-access'
import {
  approveMemoryStory,
  moveMemoryPin,
  moveMemoryStory,
  rejectMemoryStory,
  setMemoryPinStatus,
  setMemoryStoryStatus,
} from '@/lib/memory-map/mutations'
import { DEMO_MEMORY_MAP_BUNDLE } from '@/lib/memory-map/demo-data'
import type {
  AdminTab,
  MapPlacement,
  MemoryAuditLog,
  MemoryMap,
  MemoryMapBundle,
  MemoryArea,
  MemoryMapMember,
  MemoryPin,
  MemoryStory,
} from '@/lib/memory-map/types'
import { pinStats, storyTypeLabel, uploadModeLabel } from '@/lib/memory-map/utils'
import { memoryMapThemeVars } from '@/lib/memory-map/theme'
import AdminOverviewPanel from '@/components/memory-map/admin/AdminOverviewPanel'
import AdminBrandingForm from '@/components/memory-map/admin/AdminBrandingForm'
import AdminSponsorForm from '@/components/memory-map/admin/AdminSponsorForm'
import AdminAreaForm from '@/components/memory-map/admin/AdminAreaForm'
import AdminContributorsPanel from '@/components/memory-map/admin/AdminContributorsPanel'
import AdminPilotChecklist from '@/components/memory-map/admin/AdminPilotChecklist'
import AdminPilotQaPanel from '@/components/memory-map/admin/AdminPilotQaPanel'
import StoryApprovalSummary, { needsPublishConfirmation } from '@/components/memory-map/admin/StoryApprovalSummary'
import StoryGovernancePanel, {
  defaultGovernanceChecks,
  type GovernanceChecks,
} from '@/components/memory-map/admin/StoryGovernancePanel'
import MapCanvas from '@/components/memory-map/MapCanvas'
import StatusBadge, { RiskBadge } from '@/components/memory-map/StatusBadge'
import ShareQrPanel from '@/components/memory-map/ShareQrPanel'
import StoryCard from '@/components/memory-map/StoryCard'

type Props = {
  mapId: string
}

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pending', label: 'Pending' },
  { id: 'published', label: 'Published' },
  { id: 'pins', label: 'Pins' },
  { id: 'contributors', label: 'Contributors' },
  { id: 'areas', label: 'Areas' },
  { id: 'categories', label: 'Categories' },
  { id: 'branding', label: 'Branding' },
  { id: 'sponsor', label: 'Sponsor' },
  { id: 'share', label: 'Share / QR' },
  { id: 'audit', label: 'Audit' },
  { id: 'pilot', label: 'Pilot Checklist' },
  { id: 'qa', label: 'Pilot QA' },
]

type PinDeleteAction = 'cancel' | 'move' | 'archive_stories' | 'delete_stories'

export default function AdminDashboard({ mapId }: Props) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') as AdminTab | null
  const [bundle, setBundle] = useState<MemoryMapBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<AdminTab>(
    initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : 'overview'
  )
  const [allMembers, setAllMembers] = useState<MemoryMapMember[]>([])
  const [auditLogs, setAuditLogs] = useState<MemoryAuditLog[]>([])
  const [analytics, setAnalytics] = useState<MemoryMapAnalyticsSummary | null>(null)
  const [isAppAdmin, setIsAppAdmin] = useState(false)
  const [areaFormArea, setAreaFormArea] = useState<MemoryArea | null | undefined>(undefined)
  const [governanceChecks, setGovernanceChecks] = useState<GovernanceChecks | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [highRiskConfirm, setHighRiskConfirm] = useState<MemoryStory | null>(null)
  const [publishConfirmed, setPublishConfirmed] = useState(false)

  const [selectedStory, setSelectedStory] = useState<MemoryStory | null>(null)
  const [rejectStory, setRejectStory] = useState<MemoryStory | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [moveStory, setMoveStory] = useState<MemoryStory | null>(null)
  const [moveStoryAreaId, setMoveStoryAreaId] = useState('')
  const [moveStoryPinId, setMoveStoryPinId] = useState<string | null>(null)
  const [moveStoryNewPinTitle, setMoveStoryNewPinTitle] = useState('')

  const [selectedPin, setSelectedPin] = useState<MemoryPin | null>(null)
  const [movePinPlacement, setMovePinPlacement] = useState<MapPlacement | null>(null)
  const [movePinMode, setMovePinMode] = useState(false)
  const [pinDeleteAction, setPinDeleteAction] = useState<PinDeleteAction | null>(null)
  const [pinMoveStoriesToId, setPinMoveStoriesToId] = useState<string | null>(null)
  const [mergePin, setMergePin] = useState<MemoryPin | null>(null)
  const [mergeTargetPinId, setMergeTargetPinId] = useState<string | null>(null)
  const [pendingSearch, setPendingSearch] = useState('')
  const [pendingSort, setPendingSort] = useState<'newest' | 'oldest' | 'risk' | 'year'>('newest')
  const [pendingRiskOnly, setPendingRiskOnly] = useState(false)
  const [approveWeakWarning, setApproveWeakWarning] = useState<MemoryStory | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const fromDb = await fetchAdminMemoryMapBundleClient(supabase, mapId)
      if (fromDb) {
        setBundle(fromDb)
        const session = await supabase.auth.getSession()
        const userId = session.data.session?.user?.id ?? ''
        const [members, logs, stats, adminCheck] = await Promise.all([
          fetchAllMembers(supabase, mapId),
          fetchAuditLogs(supabase, mapId),
          fetchMemoryMapAnalytics(supabase, mapId),
          fetchUserIsAdmin(supabase, userId),
        ])
        setAllMembers(members)
        setAuditLogs(logs)
        setAnalytics(stats)
        setIsAppAdmin(adminCheck.isAdmin)
      } else if (mapId === DEMO_MEMORY_MAP_BUNDLE.map.id) {
        setBundle({ ...DEMO_MEMORY_MAP_BUNDLE, stories: [...DEMO_MEMORY_MAP_BUNDLE.stories] })
      } else {
        setBundle(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data.')
    } finally {
      setLoading(false)
    }
  }, [mapId])

  useEffect(() => {
    void reload()
  }, [reload])

  const map = bundle?.map
  const areas = bundle?.areas ?? []
  const categories = bundle?.categories ?? []
  const pins = bundle?.pins ?? []
  const stories = bundle?.stories ?? []

  const pendingMembers = useMemo(() => allMembers.filter((m) => m.status === 'pending'), [allMembers])
  const pending = useMemo(() => stories.filter((s) => s.status === 'pending_review'), [stories])
  const highRiskPending = useMemo(
    () => pending.filter((s) => s.risk_level === 'high' || s.risk_level === 'admin_review').length,
    [pending]
  )
  const filteredPending = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase()
    let list = [...pending]
    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.logged_by_display_name ?? '').toLowerCase().includes(q) ||
          (s.tags ?? []).some((t) => t.includes(q)) ||
          String(s.event_year).includes(q)
      )
    }
    if (pendingRiskOnly) {
      list = list.filter((s) => s.risk_level === 'high' || s.risk_level === 'admin_review')
    }
    list.sort((a, b) => {
      if (pendingSort === 'risk') {
        const score = (s: MemoryStory) => (s.risk_level === 'admin_review' ? 3 : s.risk_level === 'high' ? 2 : s.risk_level === 'medium' ? 1 : 0)
        return score(b) - score(a)
      }
      if (pendingSort === 'year') return b.event_year - a.event_year
      if (pendingSort === 'oldest') return a.id.localeCompare(b.id)
      return b.id.localeCompare(a.id)
    })
    return list
  }, [pending, pendingSearch, pendingRiskOnly, pendingSort])
  const published = useMemo(() => stories.filter((s) => s.status === 'approved'), [stories])
  const visiblePins = useMemo(() => pins.filter((p) => !['deleted', 'archived'].includes(p.status)), [pins])

  function updateMap(partial: Partial<MemoryMap>) {
    setBundle((b) => (b ? { ...b, map: { ...b.map, ...partial } } : b))
  }

  async function runAction(fn: () => Promise<{ error: string | null }>) {
    setBusy(true)
    setError('')
    const { error: err } = await fn()
    setBusy(false)
    if (err) {
      setError(err)
      return false
    }
    await reload()
    return true
  }

  function openStoryReview(story: MemoryStory) {
    setSelectedStory(story)
    setGovernanceChecks(defaultGovernanceChecks(story))
    setApprovalNote('')
    setPublishConfirmed(false)
  }

  async function onApproveStory(storyId: string, skipWeakCheck = false, skipHighRiskCheck = false) {
    const story = stories.find((s) => s.id === storyId)
    if (story && !skipWeakCheck) {
      const weak = (!story.media || story.media.length === 0) && (story.description?.trim().length ?? 0) < 40
      if (weak) {
        setApproveWeakWarning(story)
        return
      }
    }
    if (story && !skipHighRiskCheck && (story.risk_level === 'high' || story.risk_level === 'admin_review')) {
      setHighRiskConfirm(story)
      return
    }
    const note = approvalNote.trim() || undefined
    const ok = await runAction(() => approveMemoryStory(supabase, storyId, note))
    if (ok) {
      setSelectedStory(null)
      setRejectStory(null)
      setApproveWeakWarning(null)
      setHighRiskConfirm(null)
      setGovernanceChecks(null)
      setApprovalNote('')
      setPublishConfirmed(false)
    }
  }

  async function onMergePins() {
    if (!mergePin || !mergeTargetPinId) return
    const toMove = stories.filter((s) => s.pin_id === mergePin.id && !['deleted', 'archived'].includes(s.status))
    setBusy(true)
    setError('')
    for (const s of toMove) {
      const { error: err } = await moveMemoryStory(supabase, s.id, mergeTargetPinId, null)
      if (err) {
        setError(err)
        setBusy(false)
        return
      }
    }
    const { error: err } = await setMemoryPinStatus(supabase, mergePin.id, 'archived', 'none')
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    setMergePin(null)
    setMergeTargetPinId(null)
    setSelectedPin(null)
    await reload()
  }

  async function onRejectStory() {
    if (!rejectStory || !rejectReason.trim()) return
    const ok = await runAction(() => rejectMemoryStory(supabase, rejectStory.id, rejectReason.trim()))
    if (ok) {
      setRejectStory(null)
      setRejectReason('')
      setSelectedStory(null)
    }
  }

  async function onMoveStory() {
    if (!moveStory) return
    const area = areas.find((a) => a.id === moveStoryAreaId)
    if (!area) return

    if (moveStoryPinId) {
      const ok = await runAction(() => moveMemoryStory(supabase, moveStory.id, moveStoryPinId, null))
      if (ok) setMoveStory(null)
      return
    }

    if (!moveStoryNewPinTitle.trim()) {
      setError('Select a pin or enter a new pin title.')
      return
    }

    const ok = await runAction(() =>
      moveMemoryStory(supabase, moveStory.id, null, {
        area_id: area.id,
        category_id: categories[0]?.id ?? '',
        title: moveStoryNewPinTitle.trim(),
        status: 'approved',
      })
    )
    if (ok) setMoveStory(null)
  }

  async function onArchiveStory(story: MemoryStory) {
    await runAction(() => setMemoryStoryStatus(supabase, story.id, 'archived'))
    setSelectedStory(null)
  }

  async function onDeleteStory(story: MemoryStory) {
    await runAction(() => setMemoryStoryStatus(supabase, story.id, 'deleted'))
    setSelectedStory(null)
  }

  async function onSavePinMove() {
    if (!selectedPin || !movePinPlacement) return
    const area = areas.find((a) => a.id === selectedPin.area_id)
    if (!area) return
    const ok = await runAction(() =>
      moveMemoryPin(supabase, selectedPin.id, {
        lat: movePinPlacement.lat ?? null,
        lng: movePinPlacement.lng ?? null,
        x: movePinPlacement.x ?? null,
        y: movePinPlacement.y ?? null,
      })
    )
    if (ok) {
      setMovePinMode(false)
      setMovePinPlacement(null)
      setSelectedPin(null)
    }
  }

  async function onConfirmPinDelete() {
    if (!selectedPin || !pinDeleteAction || pinDeleteAction === 'cancel') return
    const storyAction =
      pinDeleteAction === 'move'
        ? 'move'
        : pinDeleteAction === 'archive_stories'
          ? 'archive_stories'
          : 'delete_stories'
    const status = pinDeleteAction === 'delete_stories' ? 'deleted' : 'archived'

    const ok = await runAction(() =>
      setMemoryPinStatus(supabase, selectedPin.id, status, storyAction, pinMoveStoriesToId)
    )
    if (ok) {
      setPinDeleteAction(null)
      setSelectedPin(null)
    }
  }

  if (loading && !bundle) {
    return (
      <div className="mm-root flex min-h-dvh items-center justify-center p-8 text-sm text-white/70">
        Loading admin…
      </div>
    )
  }

  if (!bundle || !map) {
    return (
      <div className="mm-root flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-white/70">Memory map not found or you do not have access.</p>
        <Link href="/memory-map" className="text-sm font-bold text-[var(--mm-accent)]">
          ← Back
        </Link>
      </div>
    )
  }

  const selectedPinArea = selectedPin ? areas.find((a) => a.id === selectedPin.area_id) : null
  const pinStoryCount = selectedPin
    ? stories.filter((s) => s.pin_id === selectedPin.id && !['deleted', 'archived'].includes(s.status)).length
    : 0

  return (
    <div className="mm-root min-h-dvh pb-8" style={memoryMapThemeVars(map)}>
      <header className="mm-card border-x-0 border-t-0 px-4 py-4">
        <Link href="/memory-map" className="text-xs font-bold text-[var(--mm-accent)]">
          ← Memory Map
        </Link>
        <Link href={`/memory-map/admin/${mapId}/setup`} className="text-xs font-bold text-[var(--mm-accent)]">
          Setup wizard →
        </Link>
        <h1 className="mt-2 text-xl font-black">{map.title} — Admin</h1>
        <p className="mm-muted text-sm">Moderation, branding and map management</p>
      </header>

      {error ? <p className="mx-4 mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="flex gap-2 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              tab === t.id ? 'mm-btn-primary' : 'mm-btn-secondary'
            }`}
          >
            {t.label}
            {t.id === 'pending' && pending.length > 0 ? ` (${pending.length})` : ''}
            {t.id === 'contributors' && pendingMembers.length > 0 ? ` (${pendingMembers.length})` : ''}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4">
        {tab === 'overview' && bundle ? (
          <AdminOverviewPanel
            bundle={bundle}
            pendingContributors={pendingMembers.length}
            analytics={analytics}
            onNavigate={(t) => setTab(t as AdminTab)}
          />
        ) : null}

        {tab === 'pending' ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="Search title, uploader, tag, year…"
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
              />
              <select value={pendingSort} onChange={(e) => setPendingSort(e.target.value as typeof pendingSort)} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="risk">High risk first</option>
                <option value="year">Year happened</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={pendingRiskOnly} onChange={(e) => setPendingRiskOnly(e.target.checked)} />
              High risk only
            </label>
            {filteredPending.length === 0 ? (
              <p className="mm-muted text-sm">{pending.length === 0 ? 'No pending stories.' : 'No stories match your filters.'}</p>
            ) : (
              filteredPending.map((story) => {
                const pin = pins.find((p) => p.id === story.pin_id)
                const thumb = story.media?.[0]?.thumbnail_url ?? story.media?.[0]?.file_url
                return (
                  <div key={story.id} className="mm-card rounded-2xl p-4">
                    <div className="flex gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] font-bold uppercase text-white/40">{storyTypeLabel(story.story_type)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-bold">{story.title}</p>
                            <p className="mm-muted text-xs">{story.event_year} · {story.logged_by_display_name ?? 'Contributor'}</p>
                            <p className="mm-muted text-xs">{uploadModeLabel(story.upload_mode)} · {pin?.title} · {areas.find((a) => a.id === pin?.area_id)?.name}</p>
                            {story.tags && story.tags.length > 0 ? <p className="mm-muted text-xs">{story.tags.map((t) => `#${t}`).join(' ')}</p> : null}
                            {story.media && story.media.length > 0 ? <p className="mm-muted text-xs">{story.media.length} media</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <StatusBadge status={story.status} />
                            <RiskBadge level={story.risk_level} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openStoryReview(story)} className="mm-btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold">Review</button>
                      <button type="button" disabled={busy} onClick={() => void onApproveStory(story.id)} className="mm-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50">Approve</button>
                      <button type="button" disabled={busy} onClick={() => { setRejectStory(story); setRejectReason('') }} className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 disabled:opacity-50">Reject</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}

        {tab === 'published' ? (
          <div className="space-y-3">
            {published.length === 0 ? (
              <p className="mm-muted text-sm">No published stories yet.</p>
            ) : (
              published.map((story) => (
                <div key={story.id} className="space-y-2">
                  <StoryCard story={story} mapSlug={map.slug} />
                  <div className="flex flex-wrap gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMoveStory(story)
                        const pin = pins.find((p) => p.id === story.pin_id)
                        setMoveStoryAreaId(pin?.area_id ?? areas[0]?.id ?? '')
                        setMoveStoryPinId(null)
                        setMoveStoryNewPinTitle('')
                      }}
                      className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold"
                    >
                      Move story
                    </button>
                    <button type="button" onClick={() => void onArchiveStory(story)} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">
                      Archive
                    </button>
                    <button type="button" onClick={() => void onDeleteStory(story)} className="rounded-lg border border-red-400/40 px-3 py-1 text-xs font-bold text-red-300">
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === 'pins' ? (
          <div className="space-y-3">
            {visiblePins.map((pin) => {
              const stats = pinStats(pin, stories)
              return (
                <div key={pin.id} className="mm-card rounded-2xl p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPin(pin)
                      setMovePinPlacement({ lat: pin.lat, lng: pin.lng, x: pin.x_position, y: pin.y_position })
                      setMovePinMode(false)
                      setPinDeleteAction(null)
                    }}
                    className="w-full text-left"
                  >
                    <p className="font-bold">{pin.title}</p>
                    <p className="mm-muted text-xs">{areas.find((a) => a.id === pin.area_id)?.name} · {pin.category?.name ?? '—'}</p>
                    <p className="mm-muted mt-1 text-xs">{stats.approved} approved · {stats.pending} pending · {stats.yearRange}</p>
                    <StatusBadge status={pin.status} />
                  </button>
                  <button type="button" onClick={() => { setMergePin(pin); setMergeTargetPinId(null) }} className="mm-btn-secondary mt-2 rounded-lg px-3 py-1 text-xs font-bold">
                    Merge into another pin
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        {tab === 'contributors' ? (
          <AdminContributorsPanel
            mapId={mapId}
            mapSlug={map.slug}
            members={allMembers}
            isAppAdmin={isAppAdmin}
            onChanged={() => void reload()}
          />
        ) : null}

        {tab === 'areas' ? (
          <div className="space-y-3">
            {areaFormArea !== undefined ? (
              <AdminAreaForm
                mapId={mapId}
                area={areaFormArea}
                onSaved={() => {
                  setAreaFormArea(undefined)
                  void reload()
                }}
                onCancel={() => setAreaFormArea(undefined)}
              />
            ) : (
              <>
                <button type="button" onClick={() => setAreaFormArea(null)} className="mm-btn-primary rounded-xl px-4 py-2 text-sm font-bold">
                  Create area
                </button>
                {areas.map((area) => (
                  <div key={area.id} className="mm-card rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold">{area.name}</p>
                      <span className="text-xs uppercase text-white/60">
                        {area.is_active ? area.map_type : 'archived'}
                      </span>
                    </div>
                    <p className="mm-muted mt-1 text-xs">{area.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setAreaFormArea(area)} className="mm-btn-secondary rounded-lg px-3 py-1 text-xs font-bold">
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : null}

        {tab === 'categories' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((cat) => (
              <div key={cat.id} className="mm-card flex items-center gap-3 rounded-2xl p-3">
                <span className="h-8 w-8 rounded-lg" style={{ backgroundColor: cat.colour }} />
                <div>
                  <p className="font-bold">{cat.name}</p>
                  <p className="mm-muted text-xs">{cat.icon}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'branding' ? <AdminBrandingForm map={map} onSaved={(m) => updateMap(m)} /> : null}
        {tab === 'sponsor' ? <AdminSponsorForm map={map} onSaved={(m) => updateMap(m)} /> : null}
        {tab === 'share' ? <ShareQrPanel map={map} /> : null}

        {tab === 'pilot' && bundle ? (
          <AdminPilotChecklist
            bundle={bundle}
            members={allMembers}
            pendingCount={pending.length}
            highRiskPending={highRiskPending}
          />
        ) : null}

        {tab === 'qa' && bundle ? (
          <AdminPilotQaPanel bundle={bundle} mapId={mapId} />
        ) : null}

        {tab === 'audit' ? (
          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <p className="mm-muted text-sm">No audit entries yet.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="mm-card rounded-xl p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-bold">{log.action_type}</span>
                    <span className="mm-muted">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mm-muted mt-1">
                    {log.entity_type}
                    {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}…` : ''}
                  </p>
                  {log.reason ? <p className="mt-1">{log.reason}</p> : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {selectedStory ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
            <h3 className="text-lg font-black">{selectedStory.title}</h3>
            <p className="mm-muted mt-1 text-xs">
              {selectedStory.event_year} · {selectedStory.logged_by_display_name}
            </p>
            <p className="mm-muted mt-2 text-sm whitespace-pre-wrap">{selectedStory.description}</p>
            {selectedStory.tags && selectedStory.tags.length > 0 ? (
              <p className="mt-2 text-xs text-white/60">{selectedStory.tags.map((t) => `#${t}`).join(' ')}</p>
            ) : null}
            {selectedStory.media && selectedStory.media.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {selectedStory.media.map((m) =>
                  m.media_type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={m.id} src={m.file_url} alt="" className="rounded-lg object-cover" />
                  ) : (
                    <video key={m.id} src={m.file_url} controls className="rounded-lg" />
                  )
                )}
              </div>
            ) : null}
            {governanceChecks && selectedStory ? (
              <div className="mt-4 space-y-3">
                <StoryApprovalSummary
                  story={selectedStory}
                  pin={pins.find((p) => p.id === selectedStory.pin_id) ?? null}
                  area={areas.find((a) => a.id === pins.find((p) => p.id === selectedStory.pin_id)?.area_id) ?? null}
                  category={categories.find((c) => c.id === pins.find((p) => p.id === selectedStory.pin_id)?.category_id) ?? null}
                  checks={governanceChecks}
                />
                <StoryGovernancePanel
                  story={selectedStory}
                  checks={governanceChecks}
                  onChange={setGovernanceChecks}
                  approvalNote={approvalNote}
                  onApprovalNoteChange={setApprovalNote}
                />
                {needsPublishConfirmation(selectedStory, governanceChecks) ? (
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={publishConfirmed}
                      onChange={(e) => setPublishConfirmed(e.target.checked)}
                      className="mt-0.5"
                    />
                    I have reviewed this story and confirm it may be published.
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busy ||
                  Boolean(
                    selectedStory &&
                      governanceChecks &&
                      needsPublishConfirmation(selectedStory, governanceChecks) &&
                      !publishConfirmed
                  )
                }
                onClick={() => void onApproveStory(selectedStory.id)}
                className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectStory(selectedStory)
                  setRejectReason('')
                }}
                className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-300"
              >
                Reject
              </button>
              <button type="button" onClick={() => setSelectedStory(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectStory ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card w-full max-w-md rounded-2xl p-5">
            <h3 className="text-lg font-black">Reject story</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              rows={3}
              className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy || !rejectReason.trim()} onClick={() => void onRejectStory()} className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50">
                Confirm reject
              </button>
              <button type="button" onClick={() => setRejectStory(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {moveStory ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
            <h3 className="text-lg font-black">Move story</h3>
            <p className="mm-muted mt-1 text-sm">Current pin: {pins.find((p) => p.id === moveStory.pin_id)?.title}</p>
            <select value={moveStoryAreaId} onChange={(e) => setMoveStoryAreaId(e.target.value)} className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="mm-muted mt-3 text-xs">Select existing pin</p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {visiblePins
                .filter((p) => p.area_id === moveStoryAreaId && p.id !== moveStory.pin_id)
                .map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => {
                      setMoveStoryPinId(pin.id)
                      setMoveStoryNewPinTitle('')
                    }}
                    className={`mm-card w-full rounded-lg p-2 text-left text-sm ${moveStoryPinId === pin.id ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
                  >
                    {pin.title}
                  </button>
                ))}
            </div>
            <input
              value={moveStoryNewPinTitle}
              onChange={(e) => {
                setMoveStoryNewPinTitle(e.target.value)
                if (e.target.value) setMoveStoryPinId(null)
              }}
              placeholder="Or create new pin title"
              className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void onMoveStory()} className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">
                Move
              </button>
              <button type="button" onClick={() => setMoveStory(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedPin && selectedPinArea ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="mm-card max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
            <h3 className="text-lg font-black">Pin — {selectedPin.title}</h3>
            <p className="mm-muted mt-1 text-sm">{pinStoryCount} attached stor{pinStoryCount === 1 ? 'y' : 'ies'}</p>

            {!pinDeleteAction ? (
              <>
                <p className="mm-muted mt-3 text-xs">Moving this pin will move all stories attached to it.</p>
                <button type="button" onClick={() => setMovePinMode((m) => !m)} className="mm-btn-secondary mt-3 w-full rounded-lg px-3 py-2 text-xs font-bold">
                  {movePinMode ? 'Cancel move' : 'Move pin'}
                </button>
                {movePinMode ? (
                  <>
                    <MapCanvas
                      area={selectedPinArea}
                      pins={[selectedPin]}
                      mode={selectedPinArea.map_type === 'image' ? 'image' : 'geo'}
                      onPinClick={() => {}}
                      placementMode
                      placementPreview={movePinPlacement}
                      onMapClick={(p) => setMovePinPlacement(p)}
                      showPlacementDebug
                    />
                    <button type="button" disabled={busy || !movePinPlacement} onClick={() => void onSavePinMove()} className="mm-btn-primary mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">
                      Save new position
                    </button>
                  </>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (pinStoryCount > 0) {
                        setPinDeleteAction('archive_stories')
                      } else {
                        void runAction(() => setMemoryPinStatus(supabase, selectedPin.id, 'archived', 'none')).then(
                          (ok) => ok && setSelectedPin(null)
                        )
                      }
                    }}
                    className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    Archive pin
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (pinStoryCount > 0) {
                        setPinDeleteAction('delete_stories')
                      } else {
                        void runAction(() => setMemoryPinStatus(supabase, selectedPin.id, 'deleted', 'none')).then(
                          (ok) => ok && setSelectedPin(null)
                        )
                      }
                    }}
                    className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50"
                  >
                    Delete pin
                  </button>
                  <button type="button" onClick={() => setSelectedPin(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">
                    Close
                  </button>
                </div>
                {pinStoryCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setPinDeleteAction('move')}
                    className="mm-btn-secondary mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold"
                  >
                    Move stories to another pin…
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-semibold">
                  This pin has {pinStoryCount} stories attached. What do you want to do?
                </p>
                <div className="mt-3 space-y-2">
                  {(
                    [
                      ['move', 'Move stories to another pin'],
                      ['archive_stories', 'Archive all stories and archive pin'],
                      ['delete_stories', 'Delete all stories and delete pin'],
                      ['cancel', 'Cancel'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        if (value === 'cancel') {
                          setPinDeleteAction(null)
                          return
                        }
                        setPinDeleteAction(value)
                        if (value === 'move') setPinMoveStoriesToId(null)
                      }}
                      className={`mm-card w-full rounded-lg p-3 text-left text-sm ${pinDeleteAction === value ? 'ring-2 ring-[var(--mm-accent)]' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {pinDeleteAction === 'move' ? (
                  <select
                    value={pinMoveStoriesToId ?? ''}
                    onChange={(e) => setPinMoveStoriesToId(e.target.value || null)}
                    className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm"
                  >
                    <option value="">Select destination pin</option>
                    {visiblePins
                      .filter((p) => p.id !== selectedPin.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                  </select>
                ) : null}
                {pinDeleteAction && pinDeleteAction !== 'cancel' ? (
                  <button
                    type="button"
                    disabled={busy || (pinDeleteAction === 'move' && !pinMoveStoriesToId)}
                    onClick={() => void onConfirmPinDelete()}
                    className="mm-btn-primary mt-4 w-full rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    Confirm
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {approveWeakWarning ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="mm-card max-w-md rounded-2xl p-5">
            <h3 className="text-lg font-black">Limited content</h3>
            <p className="mm-muted mt-2 text-sm">This story has limited content. Approve anyway?</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void onApproveStory(approveWeakWarning.id, true)} className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">Approve anyway</button>
              <button type="button" onClick={() => setApproveWeakWarning(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {highRiskConfirm ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="mm-card max-w-md rounded-2xl p-5">
            <h3 className="text-lg font-black">High-risk content</h3>
            <p className="mt-2 text-sm text-red-200">
              This story is marked high-risk/admin review. Confirm you have checked school policy before publishing.
            </p>
            {governanceChecks?.containsMinors ? (
              <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Ensure this aligns with the school&apos;s media/consent policy.
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onApproveStory(highRiskConfirm.id, true, true)}
                className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                Confirm approval
              </button>
              <button type="button" onClick={() => setHighRiskConfirm(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mergePin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="mm-card w-full max-w-md rounded-2xl p-5">
            <h3 className="text-lg font-black">Merge pin</h3>
            <p className="mm-muted mt-1 text-sm">Move all stories from <strong>{mergePin.title}</strong> to:</p>
            <select value={mergeTargetPinId ?? ''} onChange={(e) => setMergeTargetPinId(e.target.value || null)} className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
              <option value="">Select target pin</option>
              {visiblePins.filter((p) => p.id !== mergePin.id).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <p className="mm-muted mt-2 text-xs">Source pin will be archived after merge.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy || !mergeTargetPinId} onClick={() => void onMergePins()} className="mm-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">Merge</button>
              <button type="button" onClick={() => setMergePin(null)} className="mm-btn-secondary rounded-lg px-3 py-2 text-xs font-bold">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
