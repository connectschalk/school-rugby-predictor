import { describe, expect, it } from 'vitest'
import { teamProvinceMatchesFixtureGroup } from './province-team-directory'

describe('teamProvinceMatchesFixtureGroup', () => {
  it('matches short codes on teams.province', () => {
    expect(teamProvinceMatchesFixtureGroup('BL', 'boland', 'Boland')).toBe(true)
    expect(teamProvinceMatchesFixtureGroup('bl', 'boland', 'Boland')).toBe(true)
    expect(teamProvinceMatchesFixtureGroup('LEO', 'leopards', 'Leopards')).toBe(true)
    expect(teamProvinceMatchesFixtureGroup('PUM', 'pumas', 'Pumas')).toBe(true)
  })

  it('matches full display names normalized like game_matches', () => {
    expect(teamProvinceMatchesFixtureGroup('South Western Districts', 'south-western-districts', 'South Western Districts')).toBe(
      true
    )
    expect(teamProvinceMatchesFixtureGroup('SWD', 'south-western-districts', 'South Western Districts')).toBe(true)
  })

  it('does not treat Lions as Leopards (LEO code is Leopards only)', () => {
    expect(teamProvinceMatchesFixtureGroup('Lions', 'leopards', 'Leopards')).toBe(false)
  })

  it('matches BUL / PUM / LIM / LEO to their fixture group slugs', () => {
    expect(teamProvinceMatchesFixtureGroup('BUL', 'blue-bulls', 'Blue Bulls')).toBe(true)
    expect(teamProvinceMatchesFixtureGroup('PUM', 'pumas', 'Pumas')).toBe(true)
    expect(teamProvinceMatchesFixtureGroup('LIM', 'limpopo', 'Limpopo')).toBe(true)
  })
})
