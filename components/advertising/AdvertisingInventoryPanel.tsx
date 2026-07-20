'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AdSlot from '@/components/advertising/AdSlot'
import { useNovaDemo } from '@/components/advertising/NovaDemoProvider'
import {
  DEMO_REGIONS,
  NOVA_AD_PLACEMENTS,
  type AdDevice,
  type AdPlacementConfig,
  type AdSponsorshipType,
  type DemoRegion,
} from '@/lib/advertising/placements'
import { withNovaDemoParam } from '@/lib/nova-demo'
import { SCHOOLS_COMPETITION_SLUG } from '@/lib/competitions'

const DEMO_METRICS = {
  ad_impressions: 128_450,
  ad_clicks: 3_214,
  ctr_pct: 2.5,
  registrations: 842,
  predictions_submitted: 12_608,
  leaderboard_views: 4_105,
  returning_users: 2_318,
  most_viewed_match: 'Paarl Boys vs Grey College (demo)',
} as const

const DEMO_GUIDE_STEPS = [
  'Open the Nova-branded landing page (?novaDemo=1 or env flag).',
  'Show the homepage takeover advert beneath the header.',
  'Enter a competition — note the title sponsor strip.',
  'Scroll fixtures / predict list — inline adverts every 4–5 cards.',
  'Submit a prediction — confirm prediction_submitted fires (dataLayer).',
  'Open the leaderboard — show leaderboard sponsorship.',
  'Change demo region here — watch regional creative copy change.',
  'On a phone width, show the mobile sticky advert (and dismiss).',
  'Return to this inventory panel and review placement IDs.',
  'Walk through simulated commercial metrics (demo data only).',
  'Explain how mock placement IDs map to future GAM unit paths.',
] as const

function metricBarWidth(value: number, max: number) {
  return `${Math.max(8, Math.round((value / max) * 100))}%`
}

type Filters = {
  page: string
  sponsorshipType: string
  device: string
}

export default function AdvertisingInventoryPanel() {
  const { enabled, region, setRegion, branding } = useNovaDemo()
  const [filters, setFilters] = useState<Filters>({
    page: 'all',
    sponsorshipType: 'all',
    device: 'all',
  })

  const pages = useMemo(() => {
    const set = new Set<string>()
    NOVA_AD_PLACEMENTS.forEach((p) => p.pageTypes.forEach((t) => set.add(t)))
    return ['all', ...Array.from(set).sort()]
  }, [])

  const filtered = useMemo(() => {
    return NOVA_AD_PLACEMENTS.filter((p) => {
      if (filters.page !== 'all' && !p.pageTypes.includes(filters.page)) return false
      if (filters.sponsorshipType !== 'all' && p.sponsorshipType !== filters.sponsorshipType) {
        return false
      }
      if (filters.device === 'mobile' && p.device === 'desktop') return false
      if (filters.device === 'desktop' && p.device === 'mobile') return false
      return true
    })
  }, [filters])

  const demoLanding = withNovaDemoParam('/', true)
  const demoPredict = withNovaDemoParam(`/competitions/${SCHOOLS_COMPETITION_SLUG}/predict`, true)
  const demoLeaderboard = withNovaDemoParam(
    `/competitions/${SCHOOLS_COMPETITION_SLUG}/leaderboard`,
    true
  )

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
          Nova advertising demo · internal only
        </p>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Advertising inventory
        </h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Mock placements for commercial conversations. No live GAM tags. Product name in demo:{' '}
          <span className="font-semibold text-slate-800">{branding.productName}</span> ·{' '}
          {branding.poweredBy}.
        </p>
        {!enabled ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Demo mode is off for this session. Set{' '}
            <code className="rounded bg-white px-1">NEXT_PUBLIC_NOVA_AD_DEMO=true</code> or open
            with <code className="rounded bg-white px-1">?novaDemo=1</code> (non-production, or
            when query activation is allowed).
          </p>
        ) : (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Demo mode is active — public Predictor surfaces show Nova branding and mock ads.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href={demoLanding}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-black"
          >
            Open demo journey
          </Link>
          <Link
            href={demoPredict}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Demo predict
          </Link>
          <Link
            href={demoLeaderboard}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Demo leaderboard
          </Link>
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Demo region</h2>
        <p className="text-sm text-slate-600">
          Admin-only selector. Changes regional mock creative copy (not public Predictor nav).
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_REGIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRegion(r.id)}
              className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                region === r.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <AdSlot
          placement="nova_predictor_regional_demo"
          context={{ pageType: 'admin_demo', region }}
          variant="default"
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Filters</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Page
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
              value={filters.page}
              onChange={(e) => setFilters((f) => ({ ...f, page: e.target.value }))}
            >
              {pages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Placement type
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
              value={filters.sponsorshipType}
              onChange={(e) => setFilters((f) => ({ ...f, sponsorshipType: e.target.value }))}
            >
              <option value="all">all</option>
              {(
                [
                  'display',
                  'section_sponsor',
                  'leaderboard_sponsor',
                  'featured_match',
                  'regional',
                ] as AdSponsorshipType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Device
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
              value={filters.device}
              onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))}
            >
              <option value="all">all</option>
              <option value="mobile">mobile</option>
              <option value="desktop">desktop</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-black text-slate-900">Placements ({filtered.length})</h2>
        <ul className="space-y-4">
          {filtered.map((p) => (
            <PlacementCard key={p.id} placement={p} region={region} deviceFilter={filters.device} />
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black text-slate-900">Simulated commercial metrics</h2>
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            Demo data — not live analytics
          </span>
        </div>
        <p className="text-sm text-slate-600">
          These figures are static placeholders for sales conversations. They are not from GA4 or
          GAM.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ['Ad impressions', DEMO_METRICS.ad_impressions, 150_000],
              ['Ad clicks', DEMO_METRICS.ad_clicks, 5_000],
              ['CTR %', DEMO_METRICS.ctr_pct, 5],
              ['Registrations', DEMO_METRICS.registrations, 1_200],
              ['Predictions submitted', DEMO_METRICS.predictions_submitted, 15_000],
              ['Leaderboard views', DEMO_METRICS.leaderboard_views, 6_000],
              ['Returning users', DEMO_METRICS.returning_users, 3_000],
            ] as const
          ).map(([label, value, max]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {typeof value === 'number' && label === 'CTR %' ? value.toFixed(1) : value.toLocaleString()}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-800"
                  style={{ width: metricBarWidth(Number(value), max) }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-700">
          Most-viewed match (demo):{' '}
          <span className="font-semibold">{DEMO_METRICS.most_viewed_match}</span>
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Demo guide</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {DEMO_GUIDE_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">
          Full GAM handoff notes: <code>docs/nova-gam-integration.md</code>
        </p>
      </section>
    </div>
  )
}

function PlacementCard({
  placement,
  region,
  deviceFilter,
}: {
  placement: AdPlacementConfig
  region: DemoRegion
  deviceFilter: string
}) {
  const showPreview =
    deviceFilter === 'all' ||
    placement.device === 'both' ||
    placement.device === (deviceFilter as AdDevice)

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-slate-900">{placement.displayName}</h3>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{placement.id}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
            placement.active
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {placement.active ? 'Demo active' : 'Inactive'}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Location</dt>
          <dd className="text-slate-800">{placement.pageLocation}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Sponsorship type</dt>
          <dd className="text-slate-800">{placement.sponsorshipType}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Desktop sizes</dt>
          <dd className="text-slate-800">{placement.supportedSizesDesktop.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Mobile sizes</dt>
          <dd className="text-slate-800">{placement.supportedSizesMobile.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Refresh</dt>
          <dd className="text-slate-800">
            {placement.refreshEligible ? 'Eligible (demo rules)' : 'Not eligible'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase text-slate-500">Sales format</dt>
          <dd className="text-slate-800">{placement.salesFormat}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold uppercase text-slate-500">GAM path</dt>
          <dd className="font-mono text-xs text-slate-700">{placement.gamUnitPath}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold uppercase text-slate-500">GAM notes</dt>
          <dd className="text-slate-700">{placement.gamNotes}</dd>
        </div>
      </dl>
      {showPreview &&
      (placement.id === 'nova_predictor_home_takeover' ||
        placement.id === 'nova_predictor_fixture_inline' ||
        placement.id === 'nova_predictor_leaderboard_sponsor' ||
        placement.id === 'nova_predictor_competition_sponsor' ||
        placement.id === 'nova_predictor_results_inline' ||
        placement.id === 'nova_predictor_mobile_sticky' ||
        placement.id === 'nova_predictor_regional_demo') ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Example creative · region: {region}
          </p>
          <AdSlot
            placement={placement.id}
            context={{ pageType: 'admin_demo', region }}
            variant={
              placement.id === 'nova_predictor_home_takeover'
                ? 'takeover'
                : placement.id === 'nova_predictor_mobile_sticky'
                  ? 'sticky'
                  : placement.sponsorshipType.includes('sponsor')
                    ? 'sponsor_strip'
                    : 'default'
            }
          />
        </div>
      ) : null}
    </li>
  )
}
