'use client'

import { useState } from 'react'
import type { MemoryStory } from '@/lib/memory-map/types'
import { storyGovernanceBoolean } from '@/lib/memory-map/official-content'

export type GovernanceChecks = {
  containsMinors: boolean
  mentionsFullNames: boolean
  showsInjury: boolean
  archiveHistorical: boolean
  sponsorReference: boolean
  permissionConfirmed: boolean
  highRiskContent: boolean
}

type Props = {
  story: MemoryStory
  checks: GovernanceChecks
  onChange: (checks: GovernanceChecks) => void
  approvalNote: string
  onApprovalNoteChange: (note: string) => void
}

export default function StoryGovernancePanel({ story, checks, onChange, approvalNote, onApprovalNoteChange }: Props) {
  const items: { key: keyof GovernanceChecks; label: string }[] = [
    { key: 'containsMinors', label: 'Contains minors' },
    { key: 'mentionsFullNames', label: 'Mentions full names' },
    { key: 'showsInjury', label: 'Shows injury' },
    { key: 'archiveHistorical', label: 'Archive / historical content' },
    { key: 'sponsorReference', label: 'Sponsor / brand reference' },
    { key: 'permissionConfirmed', label: 'Permission confirmed by contributor' },
    { key: 'highRiskContent', label: 'High-risk content' },
  ]

  const isHighRisk = story.risk_level === 'high' || story.risk_level === 'admin_review'

  return (
    <div className="mm-card space-y-3 rounded-xl p-4 text-sm">
      <p className="font-bold">Content governance</p>
      <div className="space-y-2">
        {items.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={checks[key]}
              onChange={(e) => onChange({ ...checks, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      {checks.containsMinors ? (
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Ensure this aligns with the school&apos;s media/consent policy.
        </p>
      ) : null}
      {isHighRisk ? (
        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          This story is marked high-risk/admin review. Confirm you have checked school policy before publishing.
        </p>
      ) : null}
      <textarea
        value={approvalNote}
        onChange={(e) => onApprovalNoteChange(e.target.value)}
        placeholder="Optional approval note (internal)"
        rows={2}
        className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs"
      />
    </div>
  )
}

export function defaultGovernanceChecks(story: MemoryStory): GovernanceChecks {
  return {
    containsMinors: storyGovernanceBoolean(story, 'contains_minors'),
    mentionsFullNames: storyGovernanceBoolean(story, 'mentions_full_names'),
    showsInjury: storyGovernanceBoolean(story, 'shows_injury'),
    archiveHistorical:
      storyGovernanceBoolean(story, 'is_archive_content') || story.upload_mode === 'archive_submission',
    sponsorReference: storyGovernanceBoolean(story, 'sponsor_or_brand_visible'),
    permissionConfirmed: storyGovernanceBoolean(story, 'has_permission_confirmed', true),
    highRiskContent: story.risk_level === 'high' || story.risk_level === 'admin_review',
  }
}
