import { describe, expect, it } from 'vitest'
import { DEFAULT_MEMORY_CATEGORIES } from './default-categories'

describe('DEFAULT_MEMORY_CATEGORIES', () => {
  it('includes General and the standard set', () => {
    const names = DEFAULT_MEMORY_CATEGORIES.map((c) => c.name)
    expect(names).toContain('General')
    expect(names).toContain('Sport')
    expect(names).toContain('Archive')
    expect(names.length).toBe(7)
  })
})
