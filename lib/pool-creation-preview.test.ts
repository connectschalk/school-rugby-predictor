import { describe, expect, it } from 'vitest'
import type { FixtureGroupRow } from './pools'
import { matchFollowsProvinceGroup, type PoolPreviewMatch } from './pool-creation-preview'

function fg(partial: Partial<FixtureGroupRow> & Pick<FixtureGroupRow, 'id' | 'name' | 'slug'>): FixtureGroupRow {
  return {
    is_active: true,
    group_type: 'province',
    ...partial,
  }
}

describe('matchFollowsProvinceGroup', () => {
  const blueBulls = fg({
    id: '1',
    name: 'Blue Bulls',
    slug: 'blue-bulls',
    group_type: 'province',
  })

  it('matches home_team_province by normalized sheet code BUL', () => {
    const m: PoolPreviewMatch = {
      id: 'm1',
      home_team: 'A',
      away_team: 'B',
      kickoff_time: '',
      status: 'upcoming',
      home_team_province: 'BUL',
      away_team_province: 'WP',
    }
    expect(matchFollowsProvinceGroup(m, blueBulls, [])).toBe(true)
  })

  it('matches display name written on game_matches (Blue Bulls → BUL)', () => {
    const m: PoolPreviewMatch = {
      id: 'm2',
      home_team: 'A',
      away_team: 'B',
      kickoff_time: '',
      status: 'upcoming',
      home_team_province: 'Western Province',
      away_team_province: 'Blue Bulls',
    }
    expect(matchFollowsProvinceGroup(m, blueBulls, [])).toBe(true)
  })

  it('does not match WP fixture to BUL provinces', () => {
    const m: PoolPreviewMatch = {
      id: 'm3',
      home_team: 'A',
      away_team: 'B',
      kickoff_time: '',
      status: 'upcoming',
      home_team_province: 'WP',
      away_team_province: 'KZN',
    }
    expect(matchFollowsProvinceGroup(m, blueBulls, [])).toBe(false)
  })
})
