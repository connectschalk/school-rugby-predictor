import { describe, expect, it } from 'vitest'
import {
  matchBelongsToProvinceLogoCode,
  matchProvinceFieldToCode,
  type ProvinceLogoCode,
} from './province-logos'

describe('matchProvinceFieldToCode', () => {
  it('maps short codes to logo codes', () => {
    expect(matchProvinceFieldToCode('WP')).toBe('WP')
    expect(matchProvinceFieldToCode('wp')).toBe('WP')
    expect(matchProvinceFieldToCode('BL')).toBe('BL')
    expect(matchProvinceFieldToCode('bol')).toBe('BL')
    expect(matchProvinceFieldToCode('KZN')).toBe('KZN')
    expect(matchProvinceFieldToCode('LEO')).toBe('LEO')
  })

  it('maps canonical display names', () => {
    expect(matchProvinceFieldToCode('Western Province')).toBe('WP')
    expect(matchProvinceFieldToCode('Boland')).toBe('BL')
    expect(matchProvinceFieldToCode('South Western Districts')).toBe('SWD')
    expect(matchProvinceFieldToCode('KwaZulu-Natal')).toBe('KZN')
    expect(matchProvinceFieldToCode('Free State / Griquas')).toBe('FS')
  })

  it('maps BUL / PUM / LIM / LEO sheet codes and display names (Leopards ≠ Lions)', () => {
    expect(matchProvinceFieldToCode('BUL')).toBe('BUL')
    expect(matchProvinceFieldToCode('Blue Bulls')).toBe('BUL')
    expect(matchProvinceFieldToCode('PUM')).toBe('PUM')
    expect(matchProvinceFieldToCode('Pumas')).toBe('PUM')
    expect(matchProvinceFieldToCode('LIM')).toBe('LIM')
    expect(matchProvinceFieldToCode('Limpopo')).toBe('LIM')
    expect(matchProvinceFieldToCode('LEO')).toBe('LEO')
    expect(matchProvinceFieldToCode('Leopards')).toBe('LEO')
    expect(matchProvinceFieldToCode('Lions')).toBe('GP')
  })

  it('matchBelongsToProvinceLogoCode uses home/away fields only', () => {
    const code: ProvinceLogoCode = 'WP'
    expect(matchBelongsToProvinceLogoCode('WP', 'KZN', code)).toBe(true)
    expect(matchBelongsToProvinceLogoCode('Western Province', 'KZN', code)).toBe(true)
    expect(matchBelongsToProvinceLogoCode('Oakdale', 'Boland', code)).toBe(false)
  })
})
