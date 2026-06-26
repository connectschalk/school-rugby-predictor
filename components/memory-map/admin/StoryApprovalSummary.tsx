'use client'

import type { GovernanceChecks } from '@/components/memory-map/admin/StoryGovernancePanel'
import type { MemoryArea, MemoryCategory, MemoryPin, MemoryStory } from '@/lib/memory-map/types'
import { RiskBadge } from '@/components/memory-map/StatusBadge'

type Props = {
  story: MemoryStory
  pin: MemoryPin | null
  area: MemoryArea | null
  category: MemoryCategory | null
  checks: GovernanceChecks
}

export function needsPublishConfirmation(story: MemoryStory, checks: GovernanceChecks): boolean {
  return (
    story.risk_level === 'high' ||
    story.risk_level === 'admin_review' ||
    checks.containsMinors ||
    checks.showsInjury ||
    checks.mentionsFullNames ||
    checks.highRiskContent
  )
}

export default function StoryApprovalSummary({ story, pin, area, category, checks }: Props) {
  const mediaCount = story.media?.length ?? 0

  return (
    <div className="mm-card space-y-2 rounded-xl p-4 text-xs">
      <p className="font-bold">Approval summary</p>
      <dl className="grid gap-1.5">
        <Row label="Location" value={area?.name ?? '—'} />
        <Row label="Pin" value={pin?.title ?? '—'} />
        <Row label="Year" value={String(story.event_year)} />
        <Row label="Category" value={category?.name ?? '—'} />
        <Row label="Review level" value={<RiskBadge level={story.risk_level} />} />
        <Row label="Contains minors" value={checks.containsMinors ? 'Yes' : 'No'} />
        <Row label="Mentions full names" value={checks.mentionsFullNames ? 'Yes' : 'No'} />
        <Row label="Shows injury" value={checks.showsInjury ? 'Yes' : 'No'} />
        <Row label="Historical/archive" value={checks.archiveHistorical ? 'Yes' : 'No'} />
        <Row label="Sponsor or brand visible" value={checks.sponsorReference ? 'Yes' : 'No'} />
        <Row label="Permission confirmed" value={checks.permissionConfirmed ? 'Yes' : 'No'} />
        <Row label="Media" value={`${mediaCount} file${mediaCount === 1 ? '' : 's'}`} />
        <Row label="Logged by" value={story.logged_by_display_name ?? 'Contributor'} />
      </dl>
      {needsPublishConfirmation(story, checks) ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-200">
          Confirm this content is suitable for publishing on the school Memory Map.
        </p>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="mm-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
