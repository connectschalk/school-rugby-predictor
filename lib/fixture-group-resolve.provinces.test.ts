import { describe, expect, it } from 'vitest'
import {
  normalizeLeagueGroupForGameMatches,
  normalizeProvinceLabelForGameMatches,
} from './fixture-group-resolve'

/**
 * Regression: `game_matches` insert/update must not fail when Teams tab uses province short codes.
 * DB `fixture_groups.name` for canonical provinces (see migration 029 / 037).
 */
describe('normalizeProvinceLabelForGameMatches (sheet → game_matches text)', () => {
  it('Grey College vs Trio style: FS → Free State / Griquas', () => {
    expect(normalizeProvinceLabelForGameMatches('FS')).toBe('Free State / Griquas')
    expect(normalizeProvinceLabelForGameMatches(' fs ')).toBe('Free State / Griquas')
  })

  it('WP / EP / KZN / BL / SWD codes map to canonical names', () => {
    expect(normalizeProvinceLabelForGameMatches('WP')).toBe('Western Province')
    expect(normalizeProvinceLabelForGameMatches('EP')).toBe('Eastern Cape')
    expect(normalizeProvinceLabelForGameMatches('KZN')).toBe('KwaZulu-Natal')
    expect(normalizeProvinceLabelForGameMatches('BL')).toBe('Boland')
    expect(normalizeProvinceLabelForGameMatches('SWD')).toBe('South Western Districts')
  })

  it('Grey College vs Paarl Boys High: already-canonical names unchanged', () => {
    expect(normalizeProvinceLabelForGameMatches('Western Province')).toBe('Western Province')
    expect(normalizeProvinceLabelForGameMatches('Free State / Griquas')).toBe('Free State / Griquas')
  })
})

describe('normalizeLeagueGroupForGameMatches', () => {
  it('pure short code league cell normalizes like province', () => {
    expect(normalizeLeagueGroupForGameMatches('FS')).toBe('Free State / Griquas')
  })

  it('does not rewrite mixed league labels (upcoming fixtures)', () => {
    expect(normalizeLeagueGroupForGameMatches('WP Premier')).toBe('WP Premier')
    expect(normalizeLeagueGroupForGameMatches('Schools Cup')).toBe('Schools Cup')
  })
})
