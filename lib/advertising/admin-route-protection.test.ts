/**
 * Admin advertising demo route must reuse platform admin checks.
 * This smoke test asserts the page module exists and documents the gate.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('admin advertising-demo route protection', () => {
  it('gates the page with fetchUserIsAdmin (same as other admin routes)', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(inner)/admin/advertising-demo/page.tsx'),
      'utf8'
    )
    expect(src).toContain('fetchUserIsAdmin')
    expect(src).toContain("router.replace('/predict-score')")
    expect(src).toContain("router.replace('/login')")
  })
})
