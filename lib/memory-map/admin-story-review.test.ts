import { describe, expect, it } from 'vitest'
import {
  governanceFlagsFromChecks,
  parseTagsInput,
} from './admin-story-review'

describe('governanceFlagsFromChecks', () => {
  it('maps UI checks to governance_flags keys', () => {
    expect(
      governanceFlagsFromChecks({
        containsMinors: true,
        mentionsFullNames: false,
        showsInjury: true,
        archiveHistorical: false,
        sponsorReference: true,
        permissionConfirmed: true,
      })
    ).toEqual({
      contains_minors: true,
      mentions_full_names: false,
      shows_injury: true,
      is_archive_content: false,
      sponsor_or_brand_visible: true,
      has_permission_confirmed: true,
    })
  })
})

describe('parseTagsInput', () => {
  it('splits comma, hash and newline separated tags', () => {
    expect(parseTagsInput('rugby, hostel\n#derby')).toEqual(['rugby', 'hostel', 'derby'])
  })

  it('lowercases and trims tags', () => {
    expect(parseTagsInput('  Rugby , DERBY  ')).toEqual(['rugby', 'derby'])
  })
})
