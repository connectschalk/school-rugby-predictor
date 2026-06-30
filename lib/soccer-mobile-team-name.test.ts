import { describe, expect, it } from 'vitest'
import { getMobileTeamName } from './soccer-mobile-team-name'

describe('getMobileTeamName', () => {
  it('shortens long World Cup team names', () => {
    expect(getMobileTeamName('Democratic Republic of Congo')).toBe('Congo')
    expect(getMobileTeamName('DR Congo')).toBe('Congo')
    expect(getMobileTeamName('Bosnia and Herzegovina')).toBe('Bosnia')
    expect(getMobileTeamName('Bosnia & Herzegovina')).toBe('Bosnia')
  })

  it('leaves other names unchanged', () => {
    expect(getMobileTeamName('United States')).toBe('United States')
    expect(getMobileTeamName('England')).toBe('England')
    expect(getMobileTeamName('Mexico')).toBe('Mexico')
  })
})
