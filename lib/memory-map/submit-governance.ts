export type ContributorGovernanceInput = {
  containsMinors?: boolean
  mentionsFullNames?: boolean
  showsInjury?: boolean
  isArchiveContent?: boolean
  sponsorOrBrandVisible?: boolean
  hasPermissionConfirmed?: boolean
}

export const DEFAULT_CONTRIBUTOR_GOVERNANCE: Required<ContributorGovernanceInput> = {
  containsMinors: false,
  mentionsFullNames: false,
  showsInjury: false,
  isArchiveContent: false,
  sponsorOrBrandVisible: false,
  hasPermissionConfirmed: true,
}

/** RPC parameters only — persisted in memory_stories.governance_flags by submit_memory_story. */
export function contributorGovernanceRpcParams(input: ContributorGovernanceInput = {}) {
  return {
    p_contains_minors: input.containsMinors ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.containsMinors,
    p_mentions_full_names: input.mentionsFullNames ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.mentionsFullNames,
    p_shows_injury: input.showsInjury ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.showsInjury,
    p_is_archive_content: input.isArchiveContent ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.isArchiveContent,
    p_sponsor_or_brand_visible:
      input.sponsorOrBrandVisible ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.sponsorOrBrandVisible,
    p_has_permission_confirmed:
      input.hasPermissionConfirmed ?? DEFAULT_CONTRIBUTOR_GOVERNANCE.hasPermissionConfirmed,
  }
}

/** Expected JSONB shape written by submit_memory_story. */
export function contributorGovernanceFlagsJson(input: ContributorGovernanceInput = {}) {
  const params = contributorGovernanceRpcParams(input)
  return {
    contains_minors: params.p_contains_minors,
    mentions_full_names: params.p_mentions_full_names,
    shows_injury: params.p_shows_injury,
    is_archive_content: params.p_is_archive_content,
    sponsor_or_brand_visible: params.p_sponsor_or_brand_visible,
    has_permission_confirmed: params.p_has_permission_confirmed,
  }
}
