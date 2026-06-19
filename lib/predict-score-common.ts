import type { User } from '@supabase/supabase-js'
import type { GameMatch, UserPredictionRow } from '@/lib/public-prediction-game'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PREDICTION_KICKOFF_LOCK_MESSAGE } from '@/lib/prediction-cutoff'
import { ensureUserProfileExists } from '@/lib/user-profile-metadata'

/** Keep in sync with `MATCH_CARD_MARGIN_MAX` in `components/MatchCard.tsx`. */
export const PREDICT_SCORE_MARGIN_MAX = 50

/** Soccer exact-score mode: integer goals 0–20. */
export const SOCCER_GOALS_MAX = 20

export type PickState = {
  winner: 'home' | 'away' | null
  /** Digits only for margin input (1–50); empty before entry. */
  margin: string
}

export type SoccerPickState = {
  homeGoals: string
  awayGoals: string
}

export function predictionMap(rows: UserPredictionRow[]) {
  const m = new Map<string, UserPredictionRow>()
  for (const r of rows) {
    m.set(r.match_id, r)
  }
  return m
}

export function parseMarginFromInput(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > PREDICT_SCORE_MARGIN_MAX) return null
  return n
}

export function parseSoccerGoalsFromInput(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > SOCCER_GOALS_MAX) return null
  return n
}

export const defaultPick = (): PickState => ({ winner: null, margin: '' })

export const defaultSoccerPick = (): SoccerPickState => ({ homeGoals: '0', awayGoals: '0' })

export const blankSoccerPick = (): SoccerPickState => ({ homeGoals: '', awayGoals: '' })

export function hasSoccerPredictionSubmission(pred: UserPredictionRow | undefined): boolean {
  return pred?.predicted_home_score != null && pred?.predicted_away_score != null
}

export function soccerPickFromPrediction(
  pred: UserPredictionRow | undefined,
  closed: boolean
): SoccerPickState {
  if (hasSoccerPredictionSubmission(pred)) {
    return {
      homeGoals: String(pred!.predicted_home_score),
      awayGoals: String(pred!.predicted_away_score),
    }
  }
  return closed ? blankSoccerPick() : defaultSoccerPick()
}

export async function ensureUserProfile(client: SupabaseClient, user: User) {
  const { error } = await ensureUserProfileExists(client, user)
  return error
}

function provinceSectionTitle(m: GameMatch): string {
  const h = (m.home_team_province ?? '').trim()
  if (h) return h
  const a = (m.away_team_province ?? '').trim()
  return a || 'Other'
}

function dateKeySast(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function formatDateHeader(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

export type ProvinceGroup = {
  province: string
  dates: { dateKey: string; label: string; matches: GameMatch[] }[]
}

export function groupByProvinceThenDate(matchList: GameMatch[]): ProvinceGroup[] {
  const byProvince = new Map<string, Map<string, GameMatch[]>>()
  for (const m of matchList) {
    const p = provinceSectionTitle(m)
    const dk = dateKeySast(m.kickoff_time)
    if (!byProvince.has(p)) byProvince.set(p, new Map())
    const inner = byProvince.get(p)!
    if (!inner.has(dk)) inner.set(dk, [])
    inner.get(dk)!.push(m)
  }
  const provinces = [...byProvince.keys()].sort((a, b) => a.localeCompare(b))
  return provinces.map((province) => {
    const dm = byProvince.get(province)!
    const dates = [...dm.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, arr]) => ({
        dateKey,
        label: formatDateHeader(arr[0]!.kickoff_time),
        matches: arr,
      }))
    return { province, dates }
  })
}

export type DateGroupedMatches = { dateKey: string; label: string; matches: GameMatch[] }

/** Single-province Predict view: SAST date keys only (no province headings). */
export function groupByDateOnly(matchList: GameMatch[]): DateGroupedMatches[] {
  const dm = new Map<string, GameMatch[]>()
  for (const m of matchList) {
    const dk = dateKeySast(m.kickoff_time)
    if (!dm.has(dk)) dm.set(dk, [])
    dm.get(dk)!.push(m)
  }
  return [...dm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, arr]) => ({
      dateKey,
      label: formatDateHeader(arr[0]!.kickoff_time),
      matches: arr,
    }))
}

export async function upsertUserPrediction(
  client: SupabaseClient,
  user: User,
  input: { matchId: string; predictedWinner: 'home' | 'away'; predictedMargin: number }
) {
  const profileErr = await ensureUserProfile(client, user)
  if (profileErr) return { error: new Error(profileErr.message) }

  const { error } = await client.from('user_predictions').upsert(
    {
      match_id: input.matchId,
      user_id: user.id,
      predicted_winner: input.predictedWinner,
      predicted_margin: input.predictedMargin,
      predicted_home_score: null,
      predicted_away_score: null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,match_id' }
  )
  return { error: error ? new Error(error.message) : null }
}

export async function upsertSoccerUserPrediction(
  client: SupabaseClient,
  user: User,
  input: { matchId: string; predictedHomeScore: number; predictedAwayScore: number }
) {
  const {
    data: { session },
  } = await client.auth.getSession()
  const token = session?.access_token
  if (!token) return { error: new Error('Not signed in') }

  const res = await fetch('/api/predictions/soccer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      match_id: input.matchId,
      predicted_home_score: input.predictedHomeScore,
      predicted_away_score: input.predictedAwayScore,
    }),
  })

  let json: { error?: string } = {}
  try {
    json = (await res.json()) as { error?: string }
  } catch {
    return { error: new Error('Could not save prediction') }
  }

  if (!res.ok) {
    return { error: new Error(json.error ?? PREDICTION_KICKOFF_LOCK_MESSAGE) }
  }

  return { error: null }
}
