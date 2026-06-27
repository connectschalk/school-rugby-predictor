import { describe, expect, it } from 'vitest'
import { isUuid, validateMemoryMapSubmitIds } from './submit-ids'

const REAL_MAP_ID = 'a2000000-0000-4000-8000-000000000001'
const REAL_AREA_ID = 'b3000000-0000-4000-8000-000000000001'
const REAL_PIN_ID = 'c4000000-0000-4000-8000-000000000001'
const REAL_CATEGORY_ID = 'd5000000-0000-4000-8000-000000000001'

describe('isUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isUuid(REAL_MAP_ID)).toBe(true)
  })

  it('rejects demo string ids', () => {
    expect(isUuid('area-campus')).toBe(false)
    expect(isUuid('pin-scoreboard')).toBe(false)
    expect(isUuid('cat-sport')).toBe(false)
  })
})

describe('validateMemoryMapSubmitIds', () => {
  it('rejects demo source even when ids look valid', () => {
    expect(
      validateMemoryMapSubmitIds({
        source: 'demo',
        memoryMapId: REAL_MAP_ID,
        areaId: REAL_AREA_ID,
      })
    ).toBe('This map is in preview mode. Memories can be submitted once the map is connected to the live database.')
  })

  it('rejects non-UUID area ids from demo data', () => {
    expect(
      validateMemoryMapSubmitIds({
        source: 'supabase',
        memoryMapId: REAL_MAP_ID,
        areaId: 'area-campus',
      })
    ).toBe('This area is not linked to the database correctly. Refresh the page or ask admin to recreate the area.')
  })

  it('rejects non-UUID pin ids', () => {
    expect(
      validateMemoryMapSubmitIds({
        source: 'supabase',
        memoryMapId: REAL_MAP_ID,
        areaId: REAL_AREA_ID,
        existingPinId: 'pin-scoreboard',
      })
    ).toBe('This pin is not linked to the database correctly. Refresh the page or ask admin to recreate the area.')
  })

  it('allows real Supabase UUIDs', () => {
    expect(
      validateMemoryMapSubmitIds({
        source: 'supabase',
        memoryMapId: REAL_MAP_ID,
        areaId: REAL_AREA_ID,
        existingPinId: REAL_PIN_ID,
        categoryId: REAL_CATEGORY_ID,
      })
    ).toBeNull()
  })
})
