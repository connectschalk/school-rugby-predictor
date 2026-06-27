import type { RiskLevel } from '@/lib/memory-map/types'

export const CONTRIBUTOR_REVIEW_NOTE_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: 'Normal memory' },
  { value: 'medium', label: 'Needs admin check' },
  { value: 'high', label: 'Sensitive / injury / private' },
  { value: 'admin_review', label: 'I am unsure' },
]

export const OPTIONAL_GOVERNANCE_CHECKBOXES: {
  key: Exclude<keyof StoryGovernanceFlags, 'hasPermissionConfirmed'>
  label: string
}[] = [
  { key: 'containsMinors', label: 'Contains minors' },
  { key: 'mentionsFullNames', label: 'Mentions full names' },
  { key: 'showsInjury', label: 'Shows injury' },
  { key: 'isArchiveContent', label: 'Add an old memory' },
  { key: 'sponsorOrBrandVisible', label: 'Sponsor or brand visible' },
]

export const ADMIN_REVIEW_LEVEL_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: 'Low review' },
  { value: 'medium', label: 'Medium review' },
  { value: 'high', label: 'High review' },
  { value: 'admin_review', label: 'Admin review' },
]

export const REVIEW_LEVEL_OPTIONS: { value: RiskLevel; label: string }[] = [
  { value: 'low', label: 'Low review — normal public school/event moment' },
  { value: 'medium', label: 'Medium review — students visible, names mentioned, or context needs checking' },
  { value: 'high', label: 'High review — injury, sensitive, private, or potentially controversial content' },
  { value: 'admin_review', label: 'Admin review — I am unsure; let the school admin decide' },
]

export function reviewLevelAdminLabel(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return 'Low review'
    case 'medium':
      return 'Medium review'
    case 'high':
      return 'High review'
    case 'admin_review':
      return 'Admin review'
    default:
      return level
  }
}

export type StoryGovernanceFlags = {
  containsMinors: boolean
  mentionsFullNames: boolean
  showsInjury: boolean
  isArchiveContent: boolean
  sponsorOrBrandVisible: boolean
  hasPermissionConfirmed: boolean
}

export const CONTRIBUTOR_GOVERNANCE_CHECKBOXES: {
  key: keyof StoryGovernanceFlags
  label: string
  required?: boolean
}[] = [
  { key: 'containsMinors', label: 'Contains minors' },
  { key: 'mentionsFullNames', label: 'Mentions full names' },
  { key: 'showsInjury', label: 'Shows injury' },
  { key: 'isArchiveContent', label: 'Historical/archive content' },
  { key: 'sponsorOrBrandVisible', label: 'Sponsor or brand visible' },
  { key: 'hasPermissionConfirmed', label: 'I confirm I have permission to submit this content', required: true },
]
