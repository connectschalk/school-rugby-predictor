import { describe, expect, it } from 'vitest'
import {
  isKnockoutSoccerFixture,
  isSoccerGroupStageLabel,
  isSoccerKnockoutRound,
  SOCCER_WORLD_CUP_SLUG,
} from './soccer-knockout-fixture'

describe('isSoccerKnockoutRound', () => {
  it.each([
    'Round Of 32',
    'Round of 32',
    'Round 32',
    'R32',
    'Round Of 16',
    'Round of 16',
    'Round 16',
    'R16',
    'Last 16',
    'Last 32',
    'Quarterfinal',
    'Quarter-final',
    'Semi-final',
    'Semifinal',
    'Final',
    'Knockout',
    'Third place playoff',
  ])('recognises knockout label %s', (label) => {
    expect(isSoccerKnockoutRound(label)).toBe(true)
  })

  it.each(['Group A', 'Group Stage', 'group b'])('rejects group-stage label %s', (label) => {
    expect(isSoccerKnockoutRound(label)).toBe(false)
  })
})

describe('isKnockoutSoccerFixture', () => {
  it('uses World Cup fallback when round fields are blank', () => {
    expect(
      isKnockoutSoccerFixture({
        fixtureRound: null,
        leagueGroup: null,
        competitionSlug: SOCCER_WORLD_CUP_SLUG,
      })
    ).toBe(true)
  })

  it('does not treat World Cup group fixtures as knockout', () => {
    expect(
      isKnockoutSoccerFixture({
        fixtureRound: null,
        leagueGroup: 'Group H',
        competitionSlug: SOCCER_WORLD_CUP_SLUG,
      })
    ).toBe(false)
  })

  it('recognises Netherlands vs Morocco style round labels', () => {
    expect(
      isKnockoutSoccerFixture({
        fixtureRound: 'Round Of 32',
        competitionSlug: SOCCER_WORLD_CUP_SLUG,
      })
    ).toBe(true)
  })

  it('does not fallback for non-World Cup competitions without round data', () => {
    expect(
      isKnockoutSoccerFixture({
        fixtureRound: null,
        leagueGroup: null,
        competitionSlug: 'some-other-league',
      })
    ).toBe(false)
  })
})

describe('isSoccerGroupStageLabel', () => {
  it('detects group labels', () => {
    expect(isSoccerGroupStageLabel('Group A')).toBe(true)
    expect(isSoccerGroupStageLabel('group stage')).toBe(true)
  })
})
