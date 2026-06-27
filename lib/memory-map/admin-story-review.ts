import type { GovernanceChecks } from '@/components/memory-map/admin/StoryGovernancePanel'
import type { RiskLevel } from '@/lib/memory-map/types'

export type AdminStoryReviewDraft = {
  title: string
  description: string
  eventYear: string
  eventDate: string
  loggedByDisplayName: string
  riskLevel: RiskLevel
  tagsInput: string
  pinTitle: string
  pinDescription: string
  pinCategoryId: string
}

export function governanceFlagsFromChecks(checks: GovernanceChecks): Record<string, boolean> {
  return {
    contains_minors: checks.containsMinors,
    mentions_full_names: checks.mentionsFullNames,
    shows_injury: checks.showsInjury,
    is_archive_content: checks.archiveHistorical,
    sponsor_or_brand_visible: checks.sponsorReference,
    has_permission_confirmed: checks.permissionConfirmed,
  }
}

export function parseTagsInput(input: string): string[] {
  return input
    .split(/[,\n#]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}
