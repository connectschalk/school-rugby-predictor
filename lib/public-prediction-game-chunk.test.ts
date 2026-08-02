import { describe, expect, it, vi } from 'vitest'
import {
  USER_PREDICTIONS_MATCH_ID_CHUNK,
  chunkIds,
  fetchUserPredictionsForMatches,
} from './public-prediction-game'

describe('chunkIds', () => {
  it('returns empty for empty input', () => {
    expect(chunkIds([])).toEqual([])
  })

  it('keeps small lists in one chunk', () => {
    expect(chunkIds(['a', 'b'], 150)).toEqual([['a', 'b']])
  })

  it('splits at the predictions match-id chunk size', () => {
    const ids = Array.from({ length: USER_PREDICTIONS_MATCH_ID_CHUNK + 3 }, (_, i) => `id-${i}`)
    const chunks = chunkIds(ids)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(USER_PREDICTIONS_MATCH_ID_CHUNK)
    expect(chunks[1]).toHaveLength(3)
  })
})

describe('fetchUserPredictionsForMatches', () => {
  it('chunks large match_id filters so PostgREST URLs stay under gateway limits', async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    const inCalls: string[][] = []

    const client = {
      from() {
        const builder = {
          select() {
            return builder
          },
          eq() {
            return builder
          },
          in(_column: string, chunk: string[]) {
            inCalls.push(chunk)
            return Promise.resolve({ data: [], error: null })
          },
        }
        return builder
      },
    }

    const { data, error } = await fetchUserPredictionsForMatches(
      client as never,
      'user-1',
      ids
    )

    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(inCalls).toHaveLength(3)
    expect(inCalls[0]).toHaveLength(USER_PREDICTIONS_MATCH_ID_CHUNK)
    expect(inCalls[1]).toHaveLength(USER_PREDICTIONS_MATCH_ID_CHUNK)
    expect(inCalls[2]).toHaveLength(20)
    expect(Math.max(...inCalls.map((c) => c.length))).toBeLessThanOrEqual(USER_PREDICTIONS_MATCH_ID_CHUNK)
  })

  it('dedupes match ids before chunking', async () => {
    const inCalls: string[][] = []
    const client = {
      from() {
        const builder = {
          select() {
            return builder
          },
          eq() {
            return builder
          },
          in(_column: string, chunk: string[]) {
            inCalls.push(chunk)
            return Promise.resolve({ data: [{ match_id: chunk[0] }], error: null })
          },
        }
        return builder
      },
    }

    await fetchUserPredictionsForMatches(client as never, 'user-1', ['m1', 'm1', 'm2'])
    expect(inCalls).toEqual([['m1', 'm2']])
  })

  it('stops and returns the first chunk error', async () => {
    const client = {
      from() {
        const builder = {
          select() {
            return builder
          },
          eq() {
            return builder
          },
          in: vi.fn().mockResolvedValue({ data: null, error: { message: 'Bad Request' } }),
        }
        return builder
      },
    }

    const { data, error } = await fetchUserPredictionsForMatches(
      client as never,
      'user-1',
      Array.from({ length: 160 }, (_, i) => `m${i}`)
    )
    expect(data).toEqual([])
    expect(error?.message).toBe('Bad Request')
  })
})
