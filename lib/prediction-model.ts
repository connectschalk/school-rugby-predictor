/**
 * Shared margin prediction model (dampened paths, strength, trust weights).
 * Used by the public predictor and by admin pre-result snapshots.
 */

export type Team = {
  id: number
  name: string
}

export type Match = {
  id: number
  season: number
  match_date: string
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
}

export type Edge = {
  from: string
  to: string
  margin: number
  matchId: number
}

export type PathResult = {
  totalMargin: number
  path: Edge[]
  weight: number
  baselineCount: number
  consistencyScore: number
  trustFactor: number
  strongOpponentBoost: number
}

/** Subset of team_consistency used for trust weighting */
export type TeamConsistencyRow = {
  team_id: number
  adjusted_consistency: number | null
  consistency_score: number | null
  is_anchor: boolean | null
  anchor_status: string | null
}

export type PredictionResult = {
  type: 'direct' | 'indirect'
  averageMargin: number
  pathCount: number
  confidence: string
  paths: PathResult[]
  directMatch?: Match
  relevantMatches: Match[]
}

export const PREDICTOR_MODEL_VERSION = '2026.04.19-v1'

export const MAX_LINKS = 5
export const HOME_ADVANTAGE = 4

const BASELINE_TEAMS = new Set([
  'Afrikaans Hoër Seuns',
  'Grey College',
  'Paarl Gimnasium',
  'Paarl Boys High',
  'Oakdale',
  'Outeniqua',
  'Durban High',
])

/** Dampens blowouts: full credit up to ~18pts, then compresses tail so 40≈29, 60≈31 (stable chaining). */
export function dampenMargin(margin: number): number {
  const sign = margin >= 0 ? 1 : -1
  const a = Math.abs(margin)
  const knee = 18
  if (a <= knee) return margin
  const extra = a - knee
  const damped = knee + 14 * Math.tanh(extra / 22)
  return sign * damped
}

export function computeSeasonStrengthRatings(matches: Match[]): Record<string, number> {
  const teamIds: number[] = []
  const seen = new Set<number>()
  for (const m of matches) {
    if (!seen.has(m.team_a_id)) {
      seen.add(m.team_a_id)
      teamIds.push(m.team_a_id)
    }
    if (!seen.has(m.team_b_id)) {
      seen.add(m.team_b_id)
      teamIds.push(m.team_b_id)
    }
  }
  if (teamIds.length === 0) return {}

  const ratings: Record<number, number> = {}
  for (const id of teamIds) ratings[id] = 0

  const iterations = 600
  const learningRate = 0.02

  for (let i = 0; i < iterations; i++) {
    for (const match of matches) {
      const margin = dampenMargin(match.team_a_score - match.team_b_score)
      const predicted = ratings[match.team_a_id] - ratings[match.team_b_id]
      const error = predicted - margin
      ratings[match.team_a_id] -= learningRate * error
      ratings[match.team_b_id] += learningRate * error
    }
    const mean = teamIds.reduce((sum, id) => sum + ratings[id], 0) / teamIds.length
    for (const id of teamIds) ratings[id] -= mean
  }

  const out: Record<string, number> = {}
  for (const id of teamIds) out[String(id)] = ratings[id]
  return out
}

/** Stronger opponents (higher season rating) scale margin contribution up; weaker scale down. */
function getOpponentStrengthWeight(
  opponentTeamId: number | string,
  strengthMap: Record<string, number>
): number {
  const id = String(opponentTeamId)
  const vals = Object.values(strengthMap)
  if (vals.length === 0) return 1
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const r = strengthMap[id] ?? 0
  if (max - min < 1e-6) return 1
  const t = (r - min) / (max - min)
  return 0.75 + t * 0.5
}

/** Prefer Supabase consistency; fallback to margin volatility heuristic. Anchor teams get a small boost. */
function getTeamTrustWeight(
  teamId: number | string,
  volatilityConsistency: number,
  consistencyRow?: TeamConsistencyRow | null
): number {
  let w: number
  if (
    consistencyRow &&
    consistencyRow.adjusted_consistency != null &&
    !Number.isNaN(consistencyRow.adjusted_consistency)
  ) {
    const ac = Math.max(0, Math.min(1, consistencyRow.adjusted_consistency))
    w = 0.55 + 0.45 * ac
  } else {
    const v = Math.max(0.6, Math.min(1.2, volatilityConsistency))
    w = 0.65 + 0.35 * ((v - 0.6) / 0.6)
  }

  if (consistencyRow?.is_anchor) w *= 1.06
  if (consistencyRow?.anchor_status === 'trusted_anchor') w *= 1.05

  return Math.max(0.35, Math.min(1.35, w))
}

function getPathWeight(params: {
  pathLength: number
  baselineCount: number
  avgVolatilityConsistency: number
  avgTrust: number
  strongOpponentBoost: number
}): number {
  const lengthWeight = 1 / params.pathLength
  const baselineBoost = 1 + params.baselineCount * 0.2
  const consistencyWeight = params.avgVolatilityConsistency
  return (
    lengthWeight *
    baselineBoost *
    consistencyWeight *
    params.avgTrust *
    params.strongOpponentBoost
  )
}

export function buildGraph(matches: Match[]) {
  const graph: Record<string, Edge[]> = {}

  for (const match of matches) {
    const a = String(match.team_a_id)
    const b = String(match.team_b_id)
    const margin = match.team_a_score - match.team_b_score

    if (!graph[a]) graph[a] = []
    if (!graph[b]) graph[b] = []

    graph[a].push({ from: a, to: b, margin, matchId: match.id })
    graph[b].push({ from: b, to: a, margin: -margin, matchId: match.id })
  }

  return graph
}

export function getTeamName(teams: Team[], id: string) {
  return teams.find((t) => String(t.id) === id)?.name || 'Unknown team'
}

/** Volatility-based fallback when DB consistency is missing */
export function calculateTeamConsistency(matches: Match[]) {
  const teamMargins: Record<string, number[]> = {}

  for (const match of matches) {
    const a = String(match.team_a_id)
    const b = String(match.team_b_id)
    const margin = match.team_a_score - match.team_b_score

    if (!teamMargins[a]) teamMargins[a] = []
    if (!teamMargins[b]) teamMargins[b] = []

    teamMargins[a].push(margin)
    teamMargins[b].push(-margin)
  }

  const consistencyMap: Record<string, number> = {}

  for (const teamId of Object.keys(teamMargins)) {
    const margins = teamMargins[teamId]

    if (margins.length <= 1) {
      consistencyMap[teamId] = 0.8
      continue
    }

    const mean = margins.reduce((sum, m) => sum + m, 0) / margins.length
    const variance =
      margins.reduce((sum, m) => sum + Math.pow(m - mean, 2), 0) / margins.length
    const stdDev = Math.sqrt(variance)

    const score = Math.max(0.6, Math.min(1.2, 1.2 - stdDev / 40))
    consistencyMap[teamId] = Math.round(score * 1000) / 1000
  }

  return consistencyMap
}

export function findAllPathsWithWeights(
  graph: Record<string, Edge[]>,
  start: string,
  end: string,
  maxDepth: number,
  teams: Team[],
  volatilityConsistencyMap: Record<string, number>,
  strengthMap: Record<string, number>,
  consistencyByTeamId: Map<number, TeamConsistencyRow>
): PathResult[] {
  const results: PathResult[] = []

  const strengthValues = Object.values(strengthMap)
  let strongThreshold = 0
  if (strengthValues.length > 0) {
    const sorted = [...strengthValues].sort((a, b) => a - b)
    const idx = Math.floor(sorted.length * 0.75)
    strongThreshold = sorted[Math.min(idx, sorted.length - 1)]
  }

  function dfs(
    current: string,
    target: string,
    depth: number,
    visited: Set<string>,
    totalEffectiveMargin: number,
    path: Edge[]
  ) {
    if (depth > maxDepth) return

    if (current === target && path.length > 0) {
      const teamIdsInPath = new Set<string>()
      path.forEach((edge) => {
        teamIdsInPath.add(edge.from)
        teamIdsInPath.add(edge.to)
      })

      const namesInPath = [...teamIdsInPath].map((id) => getTeamName(teams, id))
      const baselineCount = namesInPath.filter((name) => BASELINE_TEAMS.has(name)).length

      const idsList = [...teamIdsInPath]
      const consistencyValues = idsList
        .filter((id) => id !== start && id !== end)
        .map((id) => volatilityConsistencyMap[id] ?? 0.8)

      const avgVolatilityConsistency =
        consistencyValues.length > 0
          ? consistencyValues.reduce((sum, v) => sum + v, 0) / consistencyValues.length
          : 1

      const trustValues = idsList.map((id) =>
        getTeamTrustWeight(
          id,
          volatilityConsistencyMap[id] ?? 0.8,
          consistencyByTeamId.get(Number(id))
        )
      )
      const avgTrust =
        trustValues.reduce((sum, v) => sum + v, 0) / Math.max(1, trustValues.length)

      let strongCount = 0
      for (const id of teamIdsInPath) {
        if (id === start || id === end) continue
        const s = strengthMap[id]
        if (s != null && s >= strongThreshold) strongCount += 1
      }
      const strongOpponentBoost = 1 + Math.min(2, strongCount) * 0.08

      const weight = getPathWeight({
        pathLength: path.length,
        baselineCount,
        avgVolatilityConsistency,
        avgTrust,
        strongOpponentBoost,
      })

      results.push({
        totalMargin: totalEffectiveMargin,
        path: [...path],
        weight,
        baselineCount,
        consistencyScore: Math.round(avgVolatilityConsistency * 1000) / 1000,
        trustFactor: Math.round(avgTrust * 1000) / 1000,
        strongOpponentBoost: Math.round(strongOpponentBoost * 1000) / 1000,
      })
      return
    }

    const neighbours = graph[current] || []

    for (const edge of neighbours) {
      if (visited.has(edge.to)) continue

      const raw = edge.margin
      const damped = dampenMargin(raw)
      const oppW = getOpponentStrengthWeight(edge.to, strengthMap)
      const stepMargin = damped * oppW

      visited.add(edge.to)
      path.push(edge)

      dfs(edge.to, target, depth + 1, visited, totalEffectiveMargin + stepMargin, path)

      path.pop()
      visited.delete(edge.to)
    }
  }

  const visited = new Set<string>([start])
  dfs(start, end, 0, visited, 0, [])

  return results
}

export function getConfidence(
  resultType: 'direct' | 'indirect',
  pathCount: number,
  totalWeight: number
) {
  if (resultType === 'direct') return 'High'
  if (pathCount >= 8 && totalWeight >= 4) return 'High'
  if (pathCount >= 3) return 'Medium'
  if (pathCount >= 1) return 'Low'
  return 'None'
}

export function getMatchSummary(match: Match, fromId: string, teams: Team[]) {
  const teamAName = getTeamName(teams, String(match.team_a_id))
  const teamBName = getTeamName(teams, String(match.team_b_id))
  const marginFromAView = match.team_a_score - match.team_b_score

  if (String(match.team_a_id) === fromId) {
    if (marginFromAView > 0) {
      return `${teamAName} beat ${teamBName} by ${Math.abs(marginFromAView)}`
    }
    if (marginFromAView < 0) {
      return `${teamAName} lost to ${teamBName} by ${Math.abs(marginFromAView)}`
    }
    return `${teamAName} drew with ${teamBName}`
  }

  const reverseMargin = -marginFromAView
  if (reverseMargin > 0) {
    return `${teamBName} beat ${teamAName} by ${Math.abs(reverseMargin)}`
  }
  if (reverseMargin < 0) {
    return `${teamBName} lost to ${teamAName} by ${Math.abs(reverseMargin)}`
  }
  return `${teamBName} drew with ${teamAName}`
}

export function formatFixture(match: Match, teams: Team[]) {
  const teamAName = getTeamName(teams, String(match.team_a_id))
  const teamBName = getTeamName(teams, String(match.team_b_id))
  return `${teamAName} ${match.team_a_score} - ${match.team_b_score} ${teamBName}`
}

export type PreMatchPrediction = {
  /** Positive = team A wins by margin; from team_a vs team_b perspective */
  predictedMargin: number | null
  predictionType: 'direct' | 'indirect' | 'none'
  confidence: string
}

/**
 * Same logic as the live predictor: margin is from team A’s perspective (team_a_id vs team_b_id).
 * Uses only the provided `matches` slice (e.g. season results before the new fixture exists).
 */
export function predictFixtureMarginTeamAPerspective(
  teamAId: number,
  teamBId: number,
  matches: Match[],
  teams: Team[],
  teamConsistencyByTeamId: Map<number, TeamConsistencyRow>
): PreMatchPrediction {
  const home = String(teamAId)
  const away = String(teamBId)

  const directMatch = matches.find(
    (m) =>
      (String(m.team_a_id) === home && String(m.team_b_id) === away) ||
      (String(m.team_a_id) === away && String(m.team_b_id) === home)
  )

  if (directMatch) {
    const margin =
      String(directMatch.team_a_id) === home
        ? directMatch.team_a_score - directMatch.team_b_score
        : directMatch.team_b_score - directMatch.team_a_score
    return {
      predictedMargin: margin,
      predictionType: 'direct',
      confidence: 'High',
    }
  }

  const graph = buildGraph(matches)
  const volatilityConsistencyMap = calculateTeamConsistency(matches)
  const strengthMap = computeSeasonStrengthRatings(matches)

  const allPaths = findAllPathsWithWeights(
    graph,
    home,
    away,
    MAX_LINKS,
    teams,
    volatilityConsistencyMap,
    strengthMap,
    teamConsistencyByTeamId
  )

  if (allPaths.length === 0) {
    return { predictedMargin: null, predictionType: 'none', confidence: 'None' }
  }

  const weightedTotal = allPaths.reduce((sum, p) => sum + p.totalMargin * p.weight, 0)
  const totalWeight = allPaths.reduce((sum, p) => sum + p.weight, 0)
  const weightedAverage = weightedTotal / totalWeight
  const confidence = getConfidence('indirect', allPaths.length, totalWeight)

  return {
    predictedMargin: weightedAverage,
    predictionType: 'indirect',
    confidence,
  }
}
