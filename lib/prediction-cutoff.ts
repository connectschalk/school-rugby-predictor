export type WithKickoffForPredictions = {
  kickoff_time: string
}

export type MatchPredictionEditGate = WithKickoffForPredictions & {
  status: string
}

/** 60-minute window before kickoff for “starts soon” UI. */
export const STARTING_SOON_WINDOW_MS = 60 * 60 * 1000

/** True when kickoff has passed or is now — predictions are closed by kickoff. */
export function predictionCutoffPassed(match: WithKickoffForPredictions, at: Date = new Date()): boolean {
  const k = match.kickoff_time
  if (!k) return false
  const t = new Date(k).getTime()
  if (Number.isNaN(t)) return false
  return t <= at.getTime()
}

/** Closed for predictions: not upcoming, or kickoff has passed (treat as locked for UX). */
export function matchPredictionsClosed(match: MatchPredictionEditGate, at: Date = new Date()): boolean {
  return match.status !== 'upcoming' || predictionCutoffPassed(match, at)
}

/**
 * Upcoming, kickoff still in the future, and kickoff within the next 60 minutes (still playable).
 */
export function matchStartsSoon(match: MatchPredictionEditGate, at: Date = new Date()): boolean {
  if (match.status !== 'upcoming') return false
  if (predictionCutoffPassed(match, at)) return false
  const k = new Date(match.kickoff_time).getTime()
  if (Number.isNaN(k)) return false
  return k <= at.getTime() + STARTING_SOON_WINDOW_MS
}

/** User may insert/update predictions: upcoming only and kickoff strictly in the future. */
export function canEditPredictionOnMatch(match: MatchPredictionEditGate, at: Date = new Date()): boolean {
  return match.status === 'upcoming' && !predictionCutoffPassed(match, at)
}

/** Time only, e.g. for “Kickoff: 15:00”. */
export function formatKickoffHm(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
