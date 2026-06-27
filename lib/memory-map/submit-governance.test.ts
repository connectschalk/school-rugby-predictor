import { describe, expect, it } from 'vitest'
import { validateQuickContributorSubmit } from './validation'
import {
  contributorGovernanceFlagsJson,
  contributorGovernanceRpcParams,
  DEFAULT_CONTRIBUTOR_GOVERNANCE,
} from './submit-governance'
import { storyGovernanceBoolean } from './official-content'
import type { MemoryStory } from './types'

describe('contributorGovernanceRpcParams', () => {
  it('passes sponsor_or_brand_visible as RPC parameter only with default false', () => {
    const params = contributorGovernanceRpcParams()
    expect(params.p_sponsor_or_brand_visible).toBe(false)
    expect(params).toHaveProperty('p_sponsor_or_brand_visible')
    expect(Object.keys(params)).not.toContain('sponsor_or_brand_visible')
  })

  it('maps optional governance overrides to RPC params', () => {
    expect(
      contributorGovernanceRpcParams({
        sponsorOrBrandVisible: true,
        containsMinors: true,
      })
    ).toEqual({
      p_contains_minors: true,
      p_mentions_full_names: false,
      p_shows_injury: false,
      p_is_archive_content: false,
      p_sponsor_or_brand_visible: true,
      p_has_permission_confirmed: true,
    })
  })

  it('builds governance_flags JSON shape for database storage', () => {
    expect(contributorGovernanceFlagsJson()).toEqual({
      contains_minors: false,
      mentions_full_names: false,
      shows_injury: false,
      is_archive_content: false,
      sponsor_or_brand_visible: false,
      has_permission_confirmed: true,
    })
  })
})

describe('quick contributor submit governance', () => {
  it('does not require governance fields for quick submit', () => {
    expect(
      validateQuickContributorSubmit({
        memoryTitle: 'Rugby logo',
        shortNote: '',
        textMemory: '',
        year: '2026',
        photoCount: 1,
        hasVideo: false,
        hasSubmissionPolicy: true,
        displayName: 'Alex',
      })
    ).toBeNull()
  })

  it('uses default false governance when omitted', () => {
    expect(DEFAULT_CONTRIBUTOR_GOVERNANCE.sponsorOrBrandVisible).toBe(false)
    expect(DEFAULT_CONTRIBUTOR_GOVERNANCE.containsMinors).toBe(false)
  })
})

describe('storyGovernanceBoolean', () => {
  const story = {
    governance_flags: {
      sponsor_or_brand_visible: true,
      contains_minors: false,
    },
  } as MemoryStory

  it('reads sponsor_or_brand_visible from governance_flags JSONB', () => {
    expect(storyGovernanceBoolean(story, 'sponsor_or_brand_visible')).toBe(true)
  })

  it('falls back to legacy columns when JSONB key absent', () => {
    const legacy = { contains_minors: true } as MemoryStory
    expect(storyGovernanceBoolean(legacy, 'contains_minors')).toBe(true)
  })
})
