import { describe, expect, it } from 'vitest'
import { resolveMemoryMapContributorName } from './user-profile'
import type { MemoryMapProfileRow } from './user-profile'

describe('memory-map user profile', () => {
  const profile: MemoryMapProfileRow = {
    user_id: 'u1',
    display_name: 'Map Name',
    contributor_name: 'Contributor Label',
    avatar_url: null,
    onboarding_completed_at: null,
  }

  it('prefers contributor_name over display_name', () => {
    expect(resolveMemoryMapContributorName(profile, null)).toBe('Contributor Label')
  })

  it('does not fall back to Predictor-style auth metadata display_name', () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      user_metadata: { display_name: 'Predictor Name', full_name: 'Predictor Full' },
    } as import('@supabase/supabase-js').User

    expect(resolveMemoryMapContributorName(null, user)).toBe('a')
  })

  it('uses memory_map-specific metadata when profile is missing', () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      user_metadata: { memory_map_contributor_name: 'MM Only' },
    } as import('@supabase/supabase-js').User

    expect(resolveMemoryMapContributorName(null, user)).toBe('MM Only')
  })
})
