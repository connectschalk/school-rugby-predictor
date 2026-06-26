import { describe, expect, it } from 'vitest'
import { buildPoolSharePayload, formatPoolShareClipboardText } from '@/lib/pool-share'

describe('buildPoolSharePayload', () => {
  it('includes title, text, and url', () => {
    const payload = buildPoolSharePayload('Rugby Factory', 'Craven Week', 'https://thenextplay.co.za/join')
    expect(payload.title).toBe('Join Rugby Factory on NextPlay Predictor')
    expect(payload.text).toContain('Craven Week')
    expect(payload.url).toBe('https://thenextplay.co.za/join')
  })
})

describe('formatPoolShareClipboardText', () => {
  it('combines all share fields', () => {
    const text = formatPoolShareClipboardText({
      title: 'Join Pool on NextPlay Predictor',
      text: 'Predict scores.',
      url: 'https://thenextplay.co.za/pool',
    })
    expect(text).toContain('Join Pool on NextPlay Predictor')
    expect(text).toContain('Predict scores.')
    expect(text).toContain('https://thenextplay.co.za/pool')
  })
})
