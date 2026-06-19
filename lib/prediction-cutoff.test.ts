import { describe, expect, it } from 'vitest'
import {
  canEditPredictionOnMatch,
  matchPredictionsClosed,
  predictionCutoffPassed,
  PREDICTION_KICKOFF_LOCK_MESSAGE,
} from './prediction-cutoff'
import {
  blankSoccerPick,
  defaultSoccerPick,
  hasSoccerPredictionSubmission,
  soccerPickFromPrediction,
} from './predict-score-common'
import type { UserPredictionRow } from './public-prediction-game'
import { parseSoccerPredictionScores } from './soccer-prediction-mutation'

const futureKickoff = '2099-06-15T14:00:00.000Z'
const pastKickoff = '2020-06-15T14:00:00.000Z'

function matchAt(kickoff: string, status = 'upcoming') {
  return { kickoff_time: kickoff, status }
}

describe('prediction kickoff lock', () => {
  it('allows edits before kickoff on upcoming fixtures', () => {
    const at = new Date('2099-06-15T13:00:00.000Z')
    const m = matchAt(futureKickoff)
    expect(predictionCutoffPassed(m, at)).toBe(false)
    expect(canEditPredictionOnMatch(m, at)).toBe(true)
    expect(matchPredictionsClosed(m, at)).toBe(false)
  })

  it('blocks edits once kickoff has passed', () => {
    const at = new Date('2020-06-15T14:30:00.000Z')
    const m = matchAt(pastKickoff)
    expect(predictionCutoffPassed(m, at)).toBe(true)
    expect(canEditPredictionOnMatch(m, at)).toBe(false)
    expect(matchPredictionsClosed(m, at)).toBe(true)
  })

  it('blocks edits at kickoff exactly', () => {
    const at = new Date('2020-06-15T14:00:00.000Z')
    const m = matchAt(pastKickoff)
    expect(predictionCutoffPassed(m, at)).toBe(true)
    expect(canEditPredictionOnMatch(m, at)).toBe(false)
  })

  it('blocks edits when fixture status is no longer upcoming', () => {
    const at = new Date('2099-06-15T13:00:00.000Z')
    const m = matchAt(futureKickoff, 'locked')
    expect(canEditPredictionOnMatch(m, at)).toBe(false)
    expect(matchPredictionsClosed(m, at)).toBe(true)
  })

  it('uses the required locked message copy', () => {
    expect(PREDICTION_KICKOFF_LOCK_MESSAGE).toBe('Prediction locked. The match has already started.')
  })
})

describe('soccer pick state', () => {
  const pred = {
    predicted_home_score: 2,
    predicted_away_score: 1,
  } as UserPredictionRow

  it('keeps blank picks for missed predictions after kickoff', () => {
    expect(soccerPickFromPrediction(undefined, true)).toEqual(blankSoccerPick())
    expect(hasSoccerPredictionSubmission(undefined)).toBe(false)
  })

  it('shows saved scores after kickoff when a prediction exists', () => {
    expect(soccerPickFromPrediction(pred, true)).toEqual({ homeGoals: '2', awayGoals: '1' })
    expect(hasSoccerPredictionSubmission(pred)).toBe(true)
  })

  it('defaults editable matches to 0-0 before kickoff', () => {
    expect(soccerPickFromPrediction(undefined, false)).toEqual(defaultSoccerPick())
  })
})

describe('parseSoccerPredictionScores', () => {
  it('accepts valid goal totals', () => {
    expect(parseSoccerPredictionScores(2, 1)).toEqual({ home: 2, away: 1 })
    expect(parseSoccerPredictionScores(0, 0)).toEqual({ home: 0, away: 0 })
  })

  it('rejects invalid goal totals', () => {
    expect(parseSoccerPredictionScores(-1, 0)).toMatchObject({ error: expect.any(String) })
    expect(parseSoccerPredictionScores(21, 0)).toMatchObject({ error: expect.any(String) })
    expect(parseSoccerPredictionScores('x', 1)).toMatchObject({ error: expect.any(String) })
  })
})
